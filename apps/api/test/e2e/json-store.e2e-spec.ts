import type { Server } from 'node:http';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { RedisService } from '../../src/redis/redis.service';
import { FakeEmailVerificationMailer } from '../../src/auth/mailers/fake-email-verification.mailer';

interface UserResponseBody {
  id: string;
  email: string;
  role: string;
  createdAt: string;
}

interface AuthTokensBody {
  accessToken: string;
  refreshToken: string;
  user: UserResponseBody;
}

interface StoreDocument {
  version: number;
  updatedAt: string;
  tables: Record<string, { entity: string; rows: Record<string, unknown>[] }>;
}

describe('JSON store persistence (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let storePath: string;
  let databaseUrl: string | undefined;

  const password = 'super-secret-password';
  const email = 'json-store-user@example.com';

  async function createApp(): Promise<INestApplication> {
    const { AppModule } = (await import('../../src/app.module')) as {
      AppModule: new () => unknown;
    };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const created = moduleRef.createNestApplication();
    await created.init();
    return created;
  }

  async function readStore(): Promise<StoreDocument> {
    return JSON.parse(await readFile(storePath, 'utf8')) as StoreDocument;
  }

  beforeAll(async () => {
    databaseUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;

    const directory = await mkdtemp(join(tmpdir(), 'mezzo-e2e-json-'));
    storePath = join(directory, 'store.json');
    process.env.JSON_STORE_PATH = storePath;
    process.env.ENV_FILE = join(directory, 'absent.env');

    app = await createApp();
    server = app.getHttpServer() as Server;
    await app.get(RedisService).flushdb();
  });

  async function verifyEmail(): Promise<void> {
    const mailer = app.get(FakeEmailVerificationMailer);
    const code = mailer.sent[mailer.sent.length - 1]?.code ?? '';
    await request(server).post('/auth/verify-email').send({ email, code });
  }

  afterAll(async () => {
    await app.close();

    delete process.env.JSON_STORE_PATH;
    delete process.env.ENV_FILE;

    if (databaseUrl) {
      process.env.DATABASE_URL = databaseUrl;
    }
  });

  it('boots without a database and reports the JSON store as healthy', async () => {
    const response = await request(server).get('/health');

    expect(response.status).toBe(200);
    const body = response.body as { info: Record<string, { status: string; path?: string }> };
    expect(body.info.jsonStore.status).toBe('up');
    expect(body.info.jsonStore.path).toBe(storePath);
    expect(body.info.database).toBeUndefined();
  });

  it('registers a user into the JSON file with the shape a database import expects', async () => {
    const response = await request(server).post('/auth/register').send({ email, password });

    expect(response.status).toBe(201);

    await verifyEmail();

    const document = await readStore();
    expect(document.version).toBe(1);
    expect(document.tables.users.entity).toBe('User');

    const row = document.tables.users.rows[0];
    expect(row.email).toBe(email);
    expect(row.role).toBe('USER');
    expect(row.kycTier).toBe('TIER_0');
    expect(row.googleSub).toBeNull();
    expect(typeof row.passwordHash).toBe('string');
    expect(String(row.passwordHash)).toContain('$argon2id$');
    expect(new Date(String(row.createdAt)).toISOString()).toBe(String(row.createdAt));
  });

  it('rejects a duplicate registration the way the unique index would', async () => {
    const response = await request(server).post('/auth/register').send({ email, password });

    expect(response.status).toBe(409);
    expect((response.body as { code: string }).code).toBe('EMAIL_ALREADY_REGISTERED');
  });

  it('logs in, authenticates a request, and rotates a refresh token', async () => {
    const loginResponse = await request(server).post('/auth/login').send({ email, password });
    expect(loginResponse.status).toBe(200);
    const tokens = loginResponse.body as AuthTokensBody;

    const me = await request(server)
      .get('/users/me')
      .set('Authorization', `Bearer ${tokens.accessToken}`);
    expect(me.status).toBe(200);
    expect((me.body as UserResponseBody).email).toBe(email);

    const refreshed = await request(server)
      .post('/auth/refresh')
      .send({ refreshToken: tokens.refreshToken });
    expect(refreshed.status).toBe(200);
    expect((refreshed.body as AuthTokensBody).refreshToken).not.toBe(tokens.refreshToken);

    const reused = await request(server)
      .post('/auth/refresh')
      .send({ refreshToken: tokens.refreshToken });
    expect(reused.status).toBe(401);
    expect((reused.body as { code: string }).code).toBe('REFRESH_TOKEN_REUSED');

    const document = await readStore();
    expect(document.tables.refresh_tokens.entity).toBe('RefreshToken');
    expect(document.tables.refresh_tokens.rows.length).toBeGreaterThan(0);
  });

  it('keeps the account after a restart against the same file', async () => {
    await app.close();
    app = await createApp();
    server = app.getHttpServer() as Server;
    await app.get(RedisService).flushdb();

    const response = await request(server).post('/auth/login').send({ email, password });

    expect(response.status).toBe(200);
    expect((response.body as AuthTokensBody).user.email).toBe(email);
  });

  it('mounts the Google sign-in route and still rejects a forged token', async () => {
    const response = await request(server).post('/auth/google').send({ idToken: 'not-a-jwt' });

    expect(response.status).toBe(401);
    expect((response.body as { code: string }).code).toBe('INVALID_GOOGLE_TOKEN');
  });

  it('does not mount the database-backed routes', async () => {
    const escrow = await request(server).get('/escrow');
    const profile = await request(server).get('/profile');

    expect(escrow.status).toBe(404);
    expect(profile.status).toBe(404);
  });
});

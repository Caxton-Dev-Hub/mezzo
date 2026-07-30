import type { Server } from 'node:http';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { Repository } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { User } from '../../src/database/entities/user.entity';
import { UserRole } from '../../src/users/entities/user-role.enum';
import { RedisService } from '../../src/redis/redis.service';

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

interface RefreshTokensBody {
  accessToken: string;
  refreshToken: string;
}

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
}

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let usersRepository: Repository<User>;
  let redis: RedisService;
  let emailCounter = 0;

  const password = 'super-secret-password';

  function uniqueEmail(): string {
    emailCounter += 1;
    return `user-${Date.now()}-${emailCounter}@example.com`;
  }

  async function register(email: string): Promise<UserResponseBody> {
    const response = await request(server).post('/auth/register').send({ email, password });
    return response.body as UserResponseBody;
  }

  async function login(email: string): Promise<AuthTokensBody> {
    const response = await request(server).post('/auth/login').send({ email, password });
    return response.body as AuthTokensBody;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer() as Server;
    usersRepository = app.get<Repository<User>>(getRepositoryToken(User));
    redis = app.get(RedisService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await redis.flushdb();
  });

  describe('register and login', () => {
    it('registers a user without leaking the password and returns an Argon2id hash', async () => {
      const email = uniqueEmail();
      const response = await request(server).post('/auth/register').send({ email, password });

      expect(response.status).toBe(201);
      const body = response.body as UserResponseBody & { password?: string; passwordHash?: string };
      expect(body.email).toBe(email);
      expect(body.password).toBeUndefined();
      expect(body.passwordHash).toBeUndefined();

      const stored = await usersRepository.findOne({ where: { email } });
      expect(stored?.passwordHash.startsWith('$argon2id$')).toBe(true);
    });

    it('registers a configured bootstrap email as an ADMIN, and everyone else as a USER', async () => {
      const bootstrapEmail = 'bootstrap-admin@example.com';
      const admin = await register(bootstrapEmail);
      expect(admin.role).toBe(UserRole.ADMIN);

      const ordinary = await register(uniqueEmail());
      expect(ordinary.role).toBe(UserRole.USER);
    });

    it('logs in a registered user and returns access + refresh tokens', async () => {
      const email = uniqueEmail();
      await register(email);

      const response = await request(server).post('/auth/login').send({ email, password });

      expect(response.status).toBe(200);
      const body = response.body as AuthTokensBody & { password?: string };
      expect(typeof body.accessToken).toBe('string');
      expect(typeof body.refreshToken).toBe('string');
      expect(body.user.email).toBe(email);
      expect(body.password).toBeUndefined();
    });

    it('returns 401 with a generic message for a wrong password without revealing which field failed', async () => {
      const email = uniqueEmail();
      await register(email);

      const wrongPassword = await request(server)
        .post('/auth/login')
        .send({ email, password: 'not-the-password' });
      const unknownEmail = await request(server)
        .post('/auth/login')
        .send({ email: uniqueEmail(), password });

      expect(wrongPassword.status).toBe(401);
      expect(unknownEmail.status).toBe(401);

      const wrongPasswordBody = wrongPassword.body as ErrorBody;
      const unknownEmailBody = unknownEmail.body as ErrorBody;
      expect(wrongPasswordBody.code).toBe('INVALID_CREDENTIALS');
      expect(wrongPasswordBody.message).toBe(unknownEmailBody.message);
    });
  });

  describe('refresh token rotation', () => {
    it('rotates the refresh token on use, and revokes the whole family on reuse', async () => {
      const email = uniqueEmail();
      await register(email);
      const initial = await login(email);

      const rotatedResponse = await request(server)
        .post('/auth/refresh')
        .send({ refreshToken: initial.refreshToken });
      expect(rotatedResponse.status).toBe(200);
      const rotated = rotatedResponse.body as RefreshTokensBody;
      expect(rotated.refreshToken).not.toBe(initial.refreshToken);

      const reuseResponse = await request(server)
        .post('/auth/refresh')
        .send({ refreshToken: initial.refreshToken });
      expect(reuseResponse.status).toBe(401);
      expect((reuseResponse.body as ErrorBody).code).toBe('REFRESH_TOKEN_REUSED');

      const rotatedAfterReuse = await request(server)
        .post('/auth/refresh')
        .send({ refreshToken: rotated.refreshToken });
      expect(rotatedAfterReuse.status).toBe(401);
    });

    it('rejects a garbage refresh token', async () => {
      const response = await request(server)
        .post('/auth/refresh')
        .send({ refreshToken: 'not-a-real-token' });

      expect(response.status).toBe(401);
      expect((response.body as ErrorBody).code).toBe('INVALID_REFRESH_TOKEN');
    });
  });

  describe('RBAC', () => {
    it('returns 403 for a USER hitting an ADMIN-only endpoint', async () => {
      const email = uniqueEmail();
      await register(email);
      const { accessToken } = await login(email);

      const response = await request(server)
        .get('/users')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(403);
    });

    it('returns 200 for an ADMIN hitting the same endpoint', async () => {
      const email = uniqueEmail();
      await register(email);
      await usersRepository.update({ email }, { role: UserRole.ADMIN });
      const { accessToken } = await login(email);

      const response = await request(server)
        .get('/users')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('auth rate limiting', () => {
    it('blocks after N failed logins from the same IP within the window', async () => {
      const email = uniqueEmail();
      await register(email);

      const maxAttempts = Number(process.env.AUTH_RATE_LIMIT_MAX_ATTEMPTS);

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const response = await request(server)
          .post('/auth/login')
          .send({ email, password: 'wrong-password' });
        expect(response.status).toBe(401);
      }

      const blocked = await request(server)
        .post('/auth/login')
        .send({ email, password: 'wrong-password' });

      expect(blocked.status).toBe(429);
      expect((blocked.body as ErrorBody).code).toBe('RATE_LIMIT_EXCEEDED');
    });
  });
});

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
import { FakePasswordResetMailer } from '../../src/auth/mailers/fake-password-reset.mailer';

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
  let passwordResetMailer: FakePasswordResetMailer;
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
    passwordResetMailer = app.get(FakePasswordResetMailer);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await redis.flushdb();
    passwordResetMailer.sent.length = 0;
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
      expect(stored?.passwordHash?.startsWith('$argon2id$')).toBe(true);
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

  describe('password reset', () => {
    const newPassword = 'a-brand-new-password';

    function issuedToken(): string {
      const resetUrl = passwordResetMailer.sent[passwordResetMailer.sent.length - 1].resetUrl;
      return new URL(resetUrl).searchParams.get('token') ?? '';
    }

    async function requestReset(email: string): Promise<number> {
      const response = await request(server).post('/auth/forgot-password').send({ email });
      return response.status;
    }

    it('emails a reset link, accepts the new password, and rejects the old one', async () => {
      const email = uniqueEmail();
      await register(email);

      expect(await requestReset(email)).toBe(204);
      expect(passwordResetMailer.sent).toHaveLength(1);

      const reset = await request(server)
        .post('/auth/reset-password')
        .send({ token: issuedToken(), password: newPassword });
      expect(reset.status).toBe(204);

      const withNew = await request(server)
        .post('/auth/login')
        .send({ email, password: newPassword });
      expect(withNew.status).toBe(200);

      const withOld = await request(server).post('/auth/login').send({ email, password });
      expect(withOld.status).toBe(401);
      expect((withOld.body as ErrorBody).code).toBe('INVALID_CREDENTIALS');
    });

    it('answers 204 for an unknown email without sending anything, so accounts cannot be enumerated', async () => {
      const known = uniqueEmail();
      await register(known);

      expect(await requestReset(known)).toBe(204);
      const knownSends = passwordResetMailer.sent.length;

      expect(await requestReset(uniqueEmail())).toBe(204);

      expect(knownSends).toBe(1);
      expect(passwordResetMailer.sent).toHaveLength(1);
    });

    it('burns the token after a successful reset', async () => {
      const email = uniqueEmail();
      await register(email);
      await requestReset(email);
      const token = issuedToken();

      const first = await request(server)
        .post('/auth/reset-password')
        .send({ token, password: newPassword });
      expect(first.status).toBe(204);

      const second = await request(server)
        .post('/auth/reset-password')
        .send({ token, password: 'yet-another-password' });
      expect(second.status).toBe(400);
      expect((second.body as ErrorBody).code).toBe('INVALID_PASSWORD_RESET_TOKEN');
    });

    it('invalidates an earlier token when a second reset is requested', async () => {
      const email = uniqueEmail();
      await register(email);

      await requestReset(email);
      const firstToken = issuedToken();
      await requestReset(email);
      const secondToken = issuedToken();

      expect(secondToken).not.toBe(firstToken);

      const stale = await request(server)
        .post('/auth/reset-password')
        .send({ token: firstToken, password: newPassword });
      expect(stale.status).toBe(400);
      expect((stale.body as ErrorBody).code).toBe('INVALID_PASSWORD_RESET_TOKEN');

      const current = await request(server)
        .post('/auth/reset-password')
        .send({ token: secondToken, password: newPassword });
      expect(current.status).toBe(204);
    });

    it('logs out existing sessions by revoking refresh tokens on reset', async () => {
      const email = uniqueEmail();
      await register(email);
      const session = await login(email);

      await requestReset(email);
      await request(server)
        .post('/auth/reset-password')
        .send({ token: issuedToken(), password: newPassword });

      const response = await request(server)
        .post('/auth/refresh')
        .send({ refreshToken: session.refreshToken });

      expect(response.status).toBe(401);
    });

    it('rejects a forged token', async () => {
      const response = await request(server)
        .post('/auth/reset-password')
        .send({ token: 'not-a-real-token', password: newPassword });

      expect(response.status).toBe(400);
      expect((response.body as ErrorBody).code).toBe('INVALID_PASSWORD_RESET_TOKEN');
    });

    it('rejects a new password that is too short before any token lookup', async () => {
      const response = await request(server)
        .post('/auth/reset-password')
        .send({ token: 'anything', password: 'short' });

      expect(response.status).toBe(400);
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

  describe('google sign-in', () => {
    it('rejects a request with no id token', async () => {
      const response = await request(server).post('/auth/google').send({});

      expect(response.status).toBe(400);
    });

    it('rejects a token that is not a JWT', async () => {
      const response = await request(server).post('/auth/google').send({ idToken: 'not-a-jwt' });

      expect(response.status).toBe(401);
      expect((response.body as ErrorBody).code).toBe('INVALID_GOOGLE_TOKEN');
    });

    it('rejects a token that carries no signing key id', async () => {
      const unsigned = [
        Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url'),
        Buffer.from(JSON.stringify({ sub: 'forged', email: 'attacker@example.com' })).toString(
          'base64url',
        ),
        'signature',
      ].join('.');

      const response = await request(server).post('/auth/google').send({ idToken: unsigned });

      expect(response.status).toBe(401);
      expect((response.body as ErrorBody).code).toBe('INVALID_GOOGLE_TOKEN');
      expect(
        await usersRepository.findOne({ where: { email: 'attacker@example.com' } }),
      ).toBeNull();
    });

    it('refuses password login for an account that only has Google linked', async () => {
      const email = uniqueEmail();
      await usersRepository.save(
        usersRepository.create({
          email,
          passwordHash: null,
          googleSub: `google-${Date.now()}`,
          role: UserRole.USER,
        }),
      );

      const response = await request(server).post('/auth/login').send({ email, password });

      expect(response.status).toBe(401);
      expect((response.body as ErrorBody).code).toBe('INVALID_CREDENTIALS');
    });
  });
});

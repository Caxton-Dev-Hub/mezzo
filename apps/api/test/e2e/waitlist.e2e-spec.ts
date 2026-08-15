import type { Server } from 'node:http';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { Repository } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { WaitlistSignup } from '../../src/database/entities/waitlist-signup.entity';
import { RedisService } from '../../src/redis/redis.service';

interface WaitlistSignupBody {
  email: string;
  createdAt: string;
}

describe('Waitlist (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let signups: Repository<WaitlistSignup>;
  let redis: RedisService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer() as Server;
    signups = app.get<Repository<WaitlistSignup>>(getRepositoryToken(WaitlistSignup));
    redis = app.get(RedisService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await redis.flushdb();
    await signups.clear();
  });

  it('adds a new email to the waitlist', async () => {
    const response = await request(server)
      .post('/waitlist')
      .send({ email: 'New.User@Example.com' });

    expect(response.status).toBe(201);
    const body = response.body as WaitlistSignupBody;
    expect(body.email).toBe('new.user@example.com');
    expect(body.createdAt).toBeDefined();

    const stored = await signups.findOne({ where: { email: 'new.user@example.com' } });
    expect(stored).not.toBeNull();
  });

  it('rejects a malformed email', async () => {
    const response = await request(server).post('/waitlist').send({ email: 'not-an-email' });

    expect(response.status).toBe(400);
  });

  it('is idempotent for an email already on the waitlist', async () => {
    await request(server).post('/waitlist').send({ email: 'again@example.com' });

    const response = await request(server).post('/waitlist').send({ email: 'again@example.com' });

    expect(response.status).toBe(201);
    const count = await signups.count({ where: { email: 'again@example.com' } });
    expect(count).toBe(1);
  });

  it('rate limits repeated join attempts from the same client', async () => {
    let lastResponse = await request(server)
      .post('/waitlist')
      .send({ email: 'rate-0@example.com' });
    for (let attempt = 1; attempt < 10; attempt += 1) {
      lastResponse = await request(server)
        .post('/waitlist')
        .send({ email: `rate-${attempt}@example.com` });
      if (lastResponse.status === 429) {
        break;
      }
    }

    expect(lastResponse.status).toBe(429);
  });
});

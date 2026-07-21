import type { Server } from 'node:http';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';

interface HealthResponseBody {
  status: string;
  details: Record<string, { status: string }>;
}

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports database and redis as up', async () => {
    const response = await request(app.getHttpServer() as Server).get('/health');
    const body = response.body as HealthResponseBody;

    expect(response.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.details.database.status).toBe('up');
    expect(body.details.redis.status).toBe('up');
  });
});

import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import { GenericContainer, StartedTestContainer } from 'testcontainers';

declare global {
  var __MEZZO_TESTCONTAINERS__:
    | { postgres: StartedPostgreSqlContainer; redis: StartedRedisContainer; minio: StartedTestContainer }
    | undefined;
}

export default async function globalSetup(): Promise<void> {
  const postgres = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('mezzo_test')
    .withUsername('mezzo')
    .withPassword('mezzo')
    .start();

  const redis = await new RedisContainer('redis:7-alpine').start();

  const minio = await new GenericContainer('minio/minio:latest')
    .withCommand(['server', '/data'])
    .withEnvironment({ MINIO_ROOT_USER: 'mezzo', MINIO_ROOT_PASSWORD: 'mezzo-minio-secret' })
    .withExposedPorts(9000)
    .start();

  const databaseUrl = postgres.getConnectionUri();
  const redisUrl = `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`;
  const s3Endpoint = `http://${minio.getHost()}:${minio.getMappedPort(9000)}`;

  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = databaseUrl;
  process.env.REDIS_URL = redisUrl;
  process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-at-least-32-characters-long';
  process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-at-least-32-characters-long';
  process.env.AUTH_RATE_LIMIT_MAX_ATTEMPTS ??= '5';
  process.env.AUTH_RATE_LIMIT_WINDOW_SECONDS ??= '60';
  process.env.S3_ENDPOINT = s3Endpoint;
  process.env.S3_REGION ??= 'us-east-1';
  process.env.S3_ACCESS_KEY_ID = 'mezzo';
  process.env.S3_SECRET_ACCESS_KEY = 'mezzo-minio-secret';
  process.env.S3_BUCKET ??= 'mezzo-evidence-test';
  process.env.S3_FORCE_PATH_STYLE = 'true';
  process.env.PAYMENT_PROVIDER ??= 'fake';
  process.env.PAYSTACK_SECRET_KEY ??= 'test-paystack-secret-key';
  process.env.FLUTTERWAVE_SECRET_HASH ??= 'test-flutterwave-secret-hash';
  process.env.ARBITRATION_PROVIDER ??= 'fake';
  process.env.ARBITRATION_CONFIDENCE_THRESHOLD ??= '0.75';
  process.env.NOTIFICATION_EMAIL_PROVIDER ??= 'fake';
  process.env.NOTIFICATION_SMS_PROVIDER ??= 'fake';
  process.env.NOTIFICATION_QUEUE_ATTEMPTS ??= '5';
  process.env.NOTIFICATION_QUEUE_BACKOFF_MS ??= '1000';
  process.env.INSPECTION_ENDING_SOON_LEAD_HOURS ??= '6';
  process.env.BOOTSTRAP_ADMIN_EMAILS ??= 'bootstrap-admin@example.com';

  execSync('pnpm typeorm migration:run', {
    cwd: join(__dirname, '..', '..'),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  });

  globalThis.__MEZZO_TESTCONTAINERS__ = { postgres, redis, minio };
}

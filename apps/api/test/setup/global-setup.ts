import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';

declare global {
  var __MEZZO_TESTCONTAINERS__:
    | { postgres: StartedPostgreSqlContainer; redis: StartedRedisContainer }
    | undefined;
}

export default async function globalSetup(): Promise<void> {
  const postgres = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('mezzo_test')
    .withUsername('mezzo')
    .withPassword('mezzo')
    .start();

  const redis = await new RedisContainer('redis:7-alpine').start();

  const databaseUrl = postgres.getConnectionUri();
  const redisUrl = `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`;

  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = databaseUrl;
  process.env.REDIS_URL = redisUrl;
  process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-at-least-32-characters-long';
  process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-at-least-32-characters-long';
  process.env.AUTH_RATE_LIMIT_MAX_ATTEMPTS ??= '5';
  process.env.AUTH_RATE_LIMIT_WINDOW_SECONDS ??= '60';

  execSync('pnpm typeorm migration:run', {
    cwd: join(__dirname, '..', '..'),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  });

  globalThis.__MEZZO_TESTCONTAINERS__ = { postgres, redis };
}

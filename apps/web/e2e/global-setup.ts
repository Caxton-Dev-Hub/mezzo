import { execFileSync } from 'node:child_process';
import { spawn, ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import {
  API_PORT,
  API_URL,
  DIST_DIR,
  HANDOFF_PATH,
  NEXT_ENV_PATH,
  PAYSTACK_SECRET,
  WEB_PORT,
  WEB_URL,
  BOOTSTRAP_ADMIN_EMAIL,
} from './stack';

const API_DIR = join(__dirname, '..', '..', 'api');
const WEB_DIR = join(__dirname, '..');

declare global {
  var __MEZZO_E2E_STACK__:
    | {
        postgres: StartedPostgreSqlContainer;
        redis: StartedRedisContainer;
        minio: StartedTestContainer;
        api: ChildProcess;
        web: ChildProcess;
      }
    | undefined;
}

async function waitForHttp(
  url: string,
  label: string,
  child: ChildProcess,
  timeoutMs = 120_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError = '';

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`${label} exited with code ${child.exitCode} before becoming ready`);
    }

    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`${label} did not become ready at ${url} within ${timeoutMs}ms (${lastError})`);
}

function apiEntrypoint(): string {
  // `nest build` mirrors the tsconfig rootDir, and apps/api includes test/** — so the
  // compiled entrypoint lands at dist/src/main.js, not dist/main.js.
  const nested = join(API_DIR, 'dist', 'src', 'main.js');
  return existsSync(nested) ? 'dist/src/main.js' : 'dist/main.js';
}

function pipeLogs(child: ChildProcess, label: string): void {
  child.stdout?.on('data', (chunk: Buffer) => process.stdout.write(`[${label}] ${chunk}`));
  child.stderr?.on('data', (chunk: Buffer) => process.stderr.write(`[${label}] ${chunk}`));
}

export default async function globalSetup(): Promise<void> {
  const postgres = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('mezzo_e2e')
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
  const apiEnv: NodeJS.ProcessEnv = {
    ...process.env,
    // Isolate the spawned API from whatever the developer's own apps/api/.env
    // happens to contain — a blank-but-present optional var there (e.g. an
    // unfilled WHATSAPP_ACCESS_TOKEN) fails z.string().min(1).optional() the
    // same way a filled one being wrong would, breaking every e2e spec's boot
    // for a reason invisible from this file. Everything the API needs is set
    // explicitly below; anything else should come from the schema's own
    // defaults, never from a file this process doesn't control.
    ENV_FILE: '/dev/null',
    NODE_ENV: 'production',
    PORT: String(API_PORT),
    CORS_ORIGINS: WEB_URL,
    WEB_APP_URL: WEB_URL,
    DATABASE_URL: databaseUrl,
    REDIS_URL: `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`,
    JWT_ACCESS_SECRET: 'e2e-access-secret-at-least-32-characters-long',
    JWT_REFRESH_SECRET: 'e2e-refresh-secret-at-least-32-characters-long',
    AUTH_RATE_LIMIT_MAX_ATTEMPTS: '100',
    AUTH_RATE_LIMIT_WINDOW_SECONDS: '60',
    S3_ENDPOINT: `http://${minio.getHost()}:${minio.getMappedPort(9000)}`,
    S3_REGION: 'us-east-1',
    S3_ACCESS_KEY_ID: 'mezzo',
    S3_SECRET_ACCESS_KEY: 'mezzo-minio-secret',
    S3_BUCKET: 'mezzo-evidence-e2e',
    S3_FORCE_PATH_STYLE: 'true',
    PAYMENT_PROVIDER: 'fake',
    PAYSTACK_SECRET_KEY: PAYSTACK_SECRET,
    BOOTSTRAP_ADMIN_EMAILS: BOOTSTRAP_ADMIN_EMAIL,
    ARBITRATION_PROVIDER: 'fake',
    NOTIFICATION_EMAIL_PROVIDER: 'fake',
    NOTIFICATION_SMS_PROVIDER: 'fake',
    LOG_LEVEL: 'warn',
  };

  execFileSync('pnpm', ['typeorm', 'migration:run'], {
    cwd: API_DIR,
    env: { ...apiEnv, NODE_ENV: 'development' },
    stdio: 'inherit',
  });

  execFileSync('pnpm', ['build'], { cwd: API_DIR, env: process.env, stdio: 'inherit' });

  const api = spawn('node', [apiEntrypoint()], { cwd: API_DIR, env: apiEnv });
  pipeLogs(api, 'api');
  await waitForHttp(`${API_URL}/health`, 'API', api);

  const webEnv: NodeJS.ProcessEnv = {
    ...process.env,
    NEXT_PUBLIC_API_URL: API_URL,
    API_INTERNAL_URL: API_URL,
    NEXT_PUBLIC_MAX_UPLOAD_MB: '25',
    NEXT_DIST_DIR: DIST_DIR,
  };

  // A dist dir left half-written by an interrupted run makes the dev server fail
  // with "Expected clientReferenceManifest to be defined", so always start clean.
  rmSync(join(WEB_DIR, DIST_DIR), { recursive: true, force: true });

  // Next rewrites this generated file to reference whichever distDir it last ran
  // against; teardown puts it back so an e2e run never leaves the tree dirty.
  const nextEnvBackup = readFileSync(NEXT_ENV_PATH, 'utf8');

  // `next dev` rather than build+start: a production build peaks well above a
  // gigabyte, which is more headroom than a developer machine running the app
  // stack plus browsers reliably has. Dev compiles each route on first request
  // instead, which is why the navigation timeouts below are generous.
  const web = spawn('pnpm', ['exec', 'next', 'dev', '--port', String(WEB_PORT)], {
    cwd: WEB_DIR,
    env: webEnv,
  });
  pipeLogs(web, 'web');
  await waitForHttp(`${WEB_URL}/login`, 'Web', web, 240_000);

  writeFileSync(HANDOFF_PATH, JSON.stringify({ databaseUrl, nextEnvBackup }), 'utf8');
  globalThis.__MEZZO_E2E_STACK__ = { postgres, redis, minio, api, web };
}

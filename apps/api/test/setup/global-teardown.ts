export default async function globalTeardown(): Promise<void> {
  const containers = globalThis.__MEZZO_TESTCONTAINERS__;

  if (!containers) {
    return;
  }

  await containers.redis.stop();
  await containers.postgres.stop();
  await containers.minio.stop();
}

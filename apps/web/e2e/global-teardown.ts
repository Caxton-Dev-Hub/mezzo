import { ChildProcess } from 'node:child_process';
import { rmSync } from 'node:fs';
import { HANDOFF_PATH } from './stack';

async function stopProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 5000);

    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });

    child.kill('SIGTERM');
  });
}

export default async function globalTeardown(): Promise<void> {
  const stack = globalThis.__MEZZO_E2E_STACK__;
  if (!stack) {
    return;
  }

  await stopProcess(stack.web);
  await stopProcess(stack.api);
  await stack.redis.stop();
  await stack.postgres.stop();
  await stack.minio.stop();

  rmSync(HANDOFF_PATH, { force: true });
}

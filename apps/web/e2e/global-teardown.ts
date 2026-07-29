import { ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { HANDOFF_PATH, NEXT_ENV_PATH, type StackHandoff } from './stack';

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

function restoreNextEnv(): void {
  if (!existsSync(HANDOFF_PATH)) {
    return;
  }

  const { nextEnvBackup } = JSON.parse(readFileSync(HANDOFF_PATH, 'utf8')) as StackHandoff;
  if (nextEnvBackup && readFileSync(NEXT_ENV_PATH, 'utf8') !== nextEnvBackup) {
    writeFileSync(NEXT_ENV_PATH, nextEnvBackup, 'utf8');
  }
}

export default async function globalTeardown(): Promise<void> {
  const stack = globalThis.__MEZZO_E2E_STACK__;

  if (stack) {
    await stopProcess(stack.web);
    await stopProcess(stack.api);
    await stack.redis.stop();
    await stack.postgres.stop();
    await stack.minio.stop();
  }

  restoreNextEnv();
  rmSync(HANDOFF_PATH, { force: true });
}

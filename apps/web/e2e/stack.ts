import { join } from 'node:path';

export const API_PORT = 4000;
export const WEB_PORT = 4001;
export const API_URL = `http://127.0.0.1:${API_PORT}`;
export const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;
export const PAYSTACK_SECRET = 'e2e-paystack-secret-key';
export const BOOTSTRAP_ADMIN_EMAIL = 'arbiter@mezzo-e2e.test';
export const DIST_DIR = '.next-e2e';

export const HANDOFF_PATH = join(__dirname, '.stack.json');

export const NEXT_ENV_PATH = join(__dirname, '..', 'next-env.d.ts');

export interface StackHandoff {
  databaseUrl: string;
  nextEnvBackup: string;
}

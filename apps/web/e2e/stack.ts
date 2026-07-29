import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const API_PORT = 4000;
export const WEB_PORT = 4001;
export const API_URL = `http://127.0.0.1:${API_PORT}`;
export const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;
export const PAYSTACK_SECRET = 'e2e-paystack-secret-key';
export const DIST_DIR = '.next-e2e';

export const HANDOFF_PATH = join(__dirname, '.stack.json');

export interface StackHandoff {
  databaseUrl: string;
}

export function readHandoff(): StackHandoff {
  return JSON.parse(readFileSync(HANDOFF_PATH, 'utf8')) as StackHandoff;
}

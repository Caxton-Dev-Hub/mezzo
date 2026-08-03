import '../config/load-env';

export const DEFAULT_JSON_STORE_PATH = '.data/mezzo-store.json';

const databaseConfigured = Boolean(process.env.DATABASE_URL?.trim());

export function isDatabaseConfigured(): boolean {
  return databaseConfigured;
}

export function resolveJsonStorePath(): string {
  return process.env.JSON_STORE_PATH?.trim() || DEFAULT_JSON_STORE_PATH;
}

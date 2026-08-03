import { config } from 'dotenv';

export const envFilePath = process.env.ENV_FILE?.trim() || '.env';

config({ path: envFilePath });

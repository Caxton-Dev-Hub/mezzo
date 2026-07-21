import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(2592000),
  AUTH_RATE_LIMIT_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  AUTH_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  KYC_PROVIDER: z.enum(['fake', 'dojah']).default('fake'),
  KYC_TIER_1_CAP_KOBO: z.coerce.number().int().positive().default(50_000_000),
  KYC_TIER_2_CAP_KOBO: z.coerce.number().int().positive().default(500_000_000),
  DOJAH_BASE_URL: z.string().url().optional(),
  DOJAH_APP_ID: z.string().min(1).optional(),
  DOJAH_PRIVATE_KEY: z.string().min(1).optional(),
  ESCROW_INVITE_EXPIRY_HOURS: z.coerce.number().int().positive().default(72),
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_FORCE_PATH_STYLE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  S3_PRESIGN_EXPIRY_SECONDS: z.coerce.number().int().positive().default(900),
  EVIDENCE_TIMESTAMP_DRIFT_HOURS: z.coerce.number().int().positive().default(720),
  PAYSTACK_PROVIDER: z.enum(['fake', 'paystack']).default('fake'),
  PAYSTACK_SECRET_KEY: z.string().min(1),
  PAYSTACK_BASE_URL: z.string().url().default('https://api.paystack.co'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${result.error.toString()}`);
  }

  return result.data;
}

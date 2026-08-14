import { z } from 'zod';
import { DEFAULT_JSON_STORE_PATH } from '../database/persistence-mode';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  CORS_ORIGINS: z.string().min(1).default('http://localhost:3001,http://localhost:3100'),
  WEB_APP_URL: z.string().url().default('http://localhost:3001'),
  DATABASE_URL: z.string().url().optional(),
  JSON_STORE_PATH: z.string().min(1).default(DEFAULT_JSON_STORE_PATH),
  REDIS_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(2592000),
  BOOTSTRAP_ADMIN_EMAILS: z.string().default(''),
  AUTH_RATE_LIMIT_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  AUTH_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  PASSWORD_RESET_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(60),
  EMAIL_VERIFICATION_CODE_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  EMAIL_VERIFICATION_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  GOOGLE_AUTH_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  VERIFICATION_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  KYC_PROVIDER: z.enum(['fake', 'dojah']).default('fake'),
  KYC_TIER_1_CAP_KOBO: z.coerce.number().int().positive().default(50_000_000),
  KYC_TIER_2_CAP_KOBO: z.coerce.number().int().positive().default(500_000_000),
  KYC_VERIFICATION_EXEMPT_THRESHOLD_KOBO: z.coerce.number().int().positive().default(10_000_000),
  DOJAH_BASE_URL: z.string().url().optional(),
  DOJAH_APP_ID: z.string().min(1).optional(),
  DOJAH_PRIVATE_KEY: z.string().min(1).optional(),
  DOJAH_WEBHOOK_SECRET: z.string().min(1).optional(),
  ESCROW_INVITE_EXPIRY_HOURS: z.coerce.number().int().positive().default(72),
  ADMIN_RISK_UNSHIPPED_HOURS: z.coerce.number().int().positive().default(48),
  ADMIN_RISK_STALE_PAYOUT_HOURS: z.coerce.number().int().positive().default(24),
  ADMIN_RISK_STALE_INTENT_HOURS: z.coerce.number().int().positive().default(6),
  ADMIN_RISK_UNSETTLED_HOURS: z.coerce.number().int().positive().default(1),
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
  DISPUTE_EVIDENCE_WINDOW_HOURS: z.coerce.number().int().positive().default(72),
  PAYMENT_PROVIDER: z.enum(['fake', 'paystack', 'flutterwave']).default('fake'),
  PAYSTACK_SECRET_KEY: z.string().min(1).optional(),
  PAYSTACK_BASE_URL: z.string().url().default('https://api.paystack.co'),
  FLUTTERWAVE_SECRET_KEY: z.string().min(1).optional(),
  FLUTTERWAVE_SECRET_HASH: z.string().min(1).optional(),
  FLUTTERWAVE_BASE_URL: z.string().url().default('https://api.flutterwave.com/v3'),
  FLUTTERWAVE_REDIRECT_URL: z.string().url().optional(),
  ARBITRATION_PROVIDER: z.enum(['fake', 'live']).default('fake'),
  ARBITRATION_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.75),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_MODEL: z.string().min(1).default('claude-sonnet-5'),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).default('gpt-4o-mini'),
  NOTIFICATION_EMAIL_PROVIDER: z.enum(['fake', 'resend']).default('fake'),
  NOTIFICATION_SMS_PROVIDER: z.enum(['fake', 'termii']).default('fake'),
  NOTIFICATION_QUEUE_ATTEMPTS: z.coerce.number().int().positive().default(5),
  NOTIFICATION_QUEUE_BACKOFF_MS: z.coerce.number().int().positive().default(30_000),
  INSPECTION_ENDING_SOON_LEAD_HOURS: z.coerce.number().int().positive().default(6),
  RESEND_API_KEY: z.string().min(1).optional(),
  RESEND_FROM_EMAIL: z.string().min(1).default('notifications@mezzo.app'),
  TERMII_API_KEY: z.string().min(1).optional(),
  TERMII_BASE_URL: z.string().url().default('https://api.ng.termii.com'),
  TERMII_SENDER_ID: z.string().min(1).default('Mezzo'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  OTEL_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  OTEL_SERVICE_NAME: z.string().min(1).default('mezzo-api'),
  WHATSAPP_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  WHATSAPP_TRANSACTIONAL_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  WHATSAPP_CLIENT_PROVIDER: z.enum(['fake', 'meta']).default('fake'),
  WHATSAPP_API_BASE_URL: z.string().url().default('https://graph.facebook.com/v20.0'),
  WHATSAPP_ACCESS_TOKEN: z.string().min(1).optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1).optional(),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().min(1).optional(),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().min(1).optional(),
  WHATSAPP_APP_SECRET: z.string().min(1).optional(),
  WHATSAPP_LINK_CODE_TTL_MINUTES: z.coerce.number().int().positive().default(10),
  WHATSAPP_LINK_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  WHATSAPP_PIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),
  WHATSAPP_PIN_LOCKOUT_MINUTES: z.coerce.number().int().positive().default(15),
  WHATSAPP_SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(600),
  WHATSAPP_MESSAGE_DEDUPE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
});

type PaymentProviderSetting = z.infer<typeof envSchema>['PAYMENT_PROVIDER'];

const PAYMENT_PROVIDER_CREDENTIALS: Record<PaymentProviderSetting, readonly (keyof Env)[]> = {
  fake: ['PAYSTACK_SECRET_KEY'],
  paystack: ['PAYSTACK_SECRET_KEY'],
  flutterwave: ['FLUTTERWAVE_SECRET_KEY', 'FLUTTERWAVE_SECRET_HASH', 'FLUTTERWAVE_REDIRECT_URL'],
};

export const configSchema = envSchema.superRefine((env, ctx) => {
  for (const key of PAYMENT_PROVIDER_CREDENTIALS[env.PAYMENT_PROVIDER]) {
    if (!env[key]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `${key} is required when PAYMENT_PROVIDER is "${env.PAYMENT_PROVIDER}"`,
      });
    }
  }

  if (env.NODE_ENV === 'production' && !env.DATABASE_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['DATABASE_URL'],
      message:
        'DATABASE_URL is required when NODE_ENV is "production"; the JSON file store is for local development only',
    });
  }

  if (env.GOOGLE_AUTH_ENABLED && !env.GOOGLE_CLIENT_ID) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['GOOGLE_CLIENT_ID'],
      message: 'GOOGLE_CLIENT_ID is required when GOOGLE_AUTH_ENABLED is "true"',
    });
  }

  if (env.KYC_PROVIDER === 'dojah' && !env.DOJAH_WEBHOOK_SECRET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['DOJAH_WEBHOOK_SECRET'],
      message: 'DOJAH_WEBHOOK_SECRET is required when KYC_PROVIDER is "dojah"',
    });
  }

  if (env.WHATSAPP_ENABLED) {
    for (const key of ['WHATSAPP_WEBHOOK_VERIFY_TOKEN', 'WHATSAPP_APP_SECRET'] as const) {
      if (!env[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when WHATSAPP_ENABLED is "true"`,
        });
      }
    }
  }

  if (env.WHATSAPP_CLIENT_PROVIDER === 'meta') {
    for (const key of ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'] as const) {
      if (!env[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when WHATSAPP_CLIENT_PROVIDER is "meta"`,
        });
      }
    }
  }
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = configSchema.safeParse(config);

  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${result.error.toString()}`);
  }

  return result.data;
}

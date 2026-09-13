import { validateEnv } from './env.schema';

function baseEnv(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    REDIS_URL: 'redis://localhost:6379',
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
    S3_ENDPOINT: 'http://localhost:9000',
    S3_ACCESS_KEY_ID: 'minio',
    S3_SECRET_ACCESS_KEY: 'minio-secret',
    S3_BUCKET: 'mezzo-evidence',
    PAYSTACK_SECRET_KEY: 'sk_test_123',
    ...overrides,
  };
}

describe('validateEnv defaults', () => {
  it('boots a local development configuration from the minimum set of variables', () => {
    const env = validateEnv(baseEnv());

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.PAYMENT_PROVIDER).toBe('fake');
  });

  it('coerces numeric variables out of their string form', () => {
    const env = validateEnv(baseEnv({ PORT: '8080', JWT_ACCESS_TTL_SECONDS: '300' }));

    expect(env.PORT).toBe(8080);
    expect(env.JWT_ACCESS_TTL_SECONDS).toBe(300);
  });

  it('turns the boolean-shaped flags into real booleans', () => {
    const env = validateEnv(baseEnv({ OTEL_ENABLED: 'true', S3_FORCE_PATH_STYLE: 'false' }));

    expect(env.OTEL_ENABLED).toBe(true);
    expect(env.S3_FORCE_PATH_STYLE).toBe(false);
  });
});

describe('validateEnv rejects malformed values', () => {
  it('rejects a missing Redis url', () => {
    const env = baseEnv();
    delete env.REDIS_URL;

    expect(() => validateEnv(env)).toThrow(/REDIS_URL/);
  });

  it('rejects a jwt secret that is too short to be safe', () => {
    expect(() => validateEnv(baseEnv({ JWT_ACCESS_SECRET: 'short' }))).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('rejects a non-url Redis endpoint', () => {
    expect(() => validateEnv(baseEnv({ REDIS_URL: 'not-a-url' }))).toThrow(/REDIS_URL/);
  });

  it('rejects a negative port', () => {
    expect(() => validateEnv(baseEnv({ PORT: '-1' }))).toThrow(/PORT/);
  });

  it('rejects an unknown node environment', () => {
    expect(() => validateEnv(baseEnv({ NODE_ENV: 'staging' }))).toThrow(/NODE_ENV/);
  });

  it('rejects a confidence threshold outside zero to one', () => {
    expect(() => validateEnv(baseEnv({ ARBITRATION_CONFIDENCE_THRESHOLD: '1.5' }))).toThrow(
      /ARBITRATION_CONFIDENCE_THRESHOLD/,
    );
  });
});

describe('validateEnv cross-field rules', () => {
  it('asks for no payment credentials when the provider is the fake one', () => {
    const env = baseEnv();
    delete env.PAYSTACK_SECRET_KEY;

    expect(validateEnv(env).PAYMENT_PROVIDER).toBe('fake');
  });

  it('demands a paystack key when paystack is the provider', () => {
    const env = baseEnv({ PAYMENT_PROVIDER: 'paystack' });
    delete env.PAYSTACK_SECRET_KEY;

    expect(() => validateEnv(env)).toThrow(/PAYSTACK_SECRET_KEY is required/);
  });

  it('demands the full flutterwave credential set when flutterwave is the provider', () => {
    expect(() => validateEnv(baseEnv({ PAYMENT_PROVIDER: 'flutterwave' }))).toThrow(
      /FLUTTERWAVE_SECRET_KEY is required/,
    );
  });

  it('accepts a complete flutterwave configuration', () => {
    const env = validateEnv(
      baseEnv({
        PAYMENT_PROVIDER: 'flutterwave',
        FLUTTERWAVE_SECRET_KEY: 'flw-secret',
        FLUTTERWAVE_SECRET_HASH: 'flw-hash',
      }),
    );

    expect(env.PAYMENT_PROVIDER).toBe('flutterwave');
  });

  it('refuses to run in production against the local json file store', () => {
    expect(() => validateEnv(baseEnv({ NODE_ENV: 'production' }))).toThrow(
      /DATABASE_URL is required when NODE_ENV is/,
    );
  });

  it('accepts production once a real database url is supplied', () => {
    const env = validateEnv(
      baseEnv({ NODE_ENV: 'production', DATABASE_URL: 'postgres://user:pass@db:5432/mezzo' }),
    );

    expect(env.NODE_ENV).toBe('production');
  });

  it('demands a client id when Google sign-in is switched on', () => {
    expect(() => validateEnv(baseEnv({ GOOGLE_AUTH_ENABLED: 'true' }))).toThrow(
      /GOOGLE_CLIENT_ID is required/,
    );
  });

  it('accepts Google sign-in with its client id', () => {
    const env = validateEnv(
      baseEnv({ GOOGLE_AUTH_ENABLED: 'true', GOOGLE_CLIENT_ID: 'google-client-id' }),
    );

    expect(env.GOOGLE_AUTH_ENABLED).toBe(true);
  });

  it('demands the full dojah credential set when the live KYC provider is selected', () => {
    expect(() => validateEnv(baseEnv({ KYC_PROVIDER: 'dojah' }))).toThrow(
      /DOJAH_BASE_URL is required/,
    );
    expect(() => validateEnv(baseEnv({ KYC_PROVIDER: 'dojah' }))).toThrow(
      /DOJAH_APP_ID is required/,
    );
    expect(() => validateEnv(baseEnv({ KYC_PROVIDER: 'dojah' }))).toThrow(
      /DOJAH_PRIVATE_KEY is required/,
    );
    expect(() => validateEnv(baseEnv({ KYC_PROVIDER: 'dojah' }))).toThrow(
      /DOJAH_WEBHOOK_SECRET is required/,
    );
  });

  it('accepts a complete dojah configuration', () => {
    const env = validateEnv(
      baseEnv({
        KYC_PROVIDER: 'dojah',
        DOJAH_BASE_URL: 'https://api.dojah.io',
        DOJAH_APP_ID: 'dojah-app-id',
        DOJAH_PRIVATE_KEY: 'dojah-private-key',
        DOJAH_WEBHOOK_SECRET: 'dojah-webhook-secret',
      }),
    );

    expect(env.KYC_PROVIDER).toBe('dojah');
  });

  it('reports every problem at once rather than one per boot', () => {
    const env = baseEnv({ NODE_ENV: 'production', GOOGLE_AUTH_ENABLED: 'true' });

    expect(() => validateEnv(env)).toThrow(/DATABASE_URL/);
    expect(() => validateEnv(env)).toThrow(/GOOGLE_CLIENT_ID/);
  });
});

describe('validateEnv treats a blank optional variable as unset', () => {
  it('boots when the unused WhatsApp credentials are present but empty', () => {
    const env = validateEnv(
      baseEnv({
        WHATSAPP_ACCESS_TOKEN: '',
        WHATSAPP_PHONE_NUMBER_ID: '',
        WHATSAPP_BUSINESS_ACCOUNT_ID: '',
        WHATSAPP_WEBHOOK_VERIFY_TOKEN: '',
        WHATSAPP_APP_SECRET: '',
      }),
    );

    expect(env.WHATSAPP_ACCESS_TOKEN).toBeUndefined();
  });

  it('treats a whitespace-only value as unset', () => {
    const env = validateEnv(baseEnv({ ANTHROPIC_API_KEY: '   ' }));

    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it('reports a blank url as the missing variable it is, not as a malformed url', () => {
    expect(() => validateEnv(baseEnv({ NODE_ENV: 'production', DATABASE_URL: '' }))).toThrow(
      /DATABASE_URL is required when NODE_ENV is/,
    );
  });

  it('still demands a credential the enabled feature needs', () => {
    expect(() =>
      validateEnv(baseEnv({ WHATSAPP_ENABLED: 'true', WHATSAPP_WEBHOOK_VERIFY_TOKEN: '' })),
    ).toThrow(/WHATSAPP_WEBHOOK_VERIFY_TOKEN is required/);
  });
});

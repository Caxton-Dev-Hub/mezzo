import { ConfigService } from '@nestjs/config';
import { S3StorageProvider } from './s3-storage.provider';

const CONFIG: Record<string, unknown> = {
  S3_BUCKET: 'mezzo-evidence',
  S3_PRESIGN_EXPIRY_SECONDS: 900,
  S3_REGION: 'us-east-1',
  S3_FORCE_PATH_STYLE: true,
  S3_ACCESS_KEY_ID: 'mezzo',
  S3_SECRET_ACCESS_KEY: 'mezzo-minio-secret',
};

function buildProvider(overrides: Record<string, unknown>): S3StorageProvider {
  const values = { ...CONFIG, ...overrides };
  const configService = {
    getOrThrow: (key: string): unknown => {
      if (!(key in values)) {
        throw new Error(`missing config key ${key}`);
      }
      return values[key];
    },
    get: (key: string): unknown => values[key],
  } as unknown as ConfigService;

  return new S3StorageProvider(configService);
}

describe('S3StorageProvider presign endpoint', () => {
  it('signs upload URLs against S3_ENDPOINT when no public endpoint is configured', async () => {
    const provider = buildProvider({ S3_ENDPOINT: 'http://localhost:9000' });

    const url = await provider.getPresignedUploadUrl('evidence/abc', 'image/jpeg');

    expect(url).toContain('http://localhost:9000/mezzo-evidence/evidence/abc');
  });

  it('signs upload URLs against S3_PUBLIC_ENDPOINT when the browser reaches S3 elsewhere', async () => {
    const provider = buildProvider({
      S3_ENDPOINT: 'http://minio:9000',
      S3_PUBLIC_ENDPOINT: 'http://localhost:9000',
    });

    const url = await provider.getPresignedUploadUrl('evidence/abc', 'image/jpeg');

    expect(url).toContain('http://localhost:9000/mezzo-evidence/evidence/abc');
    expect(url).not.toContain('minio:9000');
  });

  it('ignores a blank public endpoint and falls back to S3_ENDPOINT', async () => {
    const provider = buildProvider({
      S3_ENDPOINT: 'http://minio:9000',
      S3_PUBLIC_ENDPOINT: '',
    });

    const url = await provider.getPresignedUploadUrl('evidence/abc', 'image/jpeg');

    expect(url).toContain('http://minio:9000/mezzo-evidence/evidence/abc');
  });

  it('signs download URLs against the public endpoint too', async () => {
    const provider = buildProvider({
      S3_ENDPOINT: 'http://minio:9000',
      S3_PUBLIC_ENDPOINT: 'http://localhost:9000',
    });

    const url = await provider.getPresignedDownloadUrl('evidence/abc');

    expect(url).toContain('http://localhost:9000/mezzo-evidence/evidence/abc');
  });
});

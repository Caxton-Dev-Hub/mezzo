import { createHmac } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { KycWebhookSignatureService } from './webhook-signature.service';
import { InvalidWebhookSignatureError } from './errors/invalid-webhook-signature.error';

const SECRET = 'unit-test-dojah-webhook-secret';

function buildService(kycProvider: string | undefined, secret = SECRET): KycWebhookSignatureService {
  const configService = {
    get: jest.fn().mockReturnValue(kycProvider),
    getOrThrow: jest.fn().mockReturnValue(secret),
  } as unknown as ConfigService;
  return new KycWebhookSignatureService(configService);
}

function sign(body: Buffer): string {
  return createHmac('sha256', SECRET).update(body).digest('hex');
}

describe('KycWebhookSignatureService.verify', () => {
  it('skips verification when KYC_PROVIDER is not dojah', () => {
    const service = buildService('fake');
    const rawBody = Buffer.from(JSON.stringify({ providerReference: 'ref-1', status: 'APPROVED' }));

    expect(() => service.verify(rawBody, undefined)).not.toThrow();
  });

  it('accepts a signature computed correctly over the raw body', () => {
    const service = buildService('dojah');
    const rawBody = Buffer.from(JSON.stringify({ providerReference: 'ref-1', status: 'APPROVED' }));

    expect(() => service.verify(rawBody, sign(rawBody))).not.toThrow();
  });

  it('rejects a missing signature header', () => {
    const service = buildService('dojah');
    const rawBody = Buffer.from(JSON.stringify({ providerReference: 'ref-1', status: 'APPROVED' }));

    expect(() => service.verify(rawBody, undefined)).toThrow(InvalidWebhookSignatureError);
  });

  it('rejects a signature computed with the wrong secret', () => {
    const service = buildService('dojah');
    const rawBody = Buffer.from(JSON.stringify({ providerReference: 'ref-1', status: 'APPROVED' }));
    const wrongSignature = createHmac('sha256', 'a-different-secret').update(rawBody).digest('hex');

    expect(() => service.verify(rawBody, wrongSignature)).toThrow(InvalidWebhookSignatureError);
  });

  it('rejects a signature that does not match a tampered body', () => {
    const service = buildService('dojah');
    const originalBody = Buffer.from(
      JSON.stringify({ providerReference: 'ref-1', status: 'APPROVED' }),
    );
    const signature = sign(originalBody);
    const tamperedBody = Buffer.from(
      JSON.stringify({ providerReference: 'ref-1', status: 'REJECTED' }),
    );

    expect(() => service.verify(tamperedBody, signature)).toThrow(InvalidWebhookSignatureError);
  });

  it('rejects a non-hex signature without throwing from the buffer comparison itself', () => {
    const service = buildService('dojah');
    const rawBody = Buffer.from(JSON.stringify({ providerReference: 'ref-1', status: 'APPROVED' }));

    expect(() => service.verify(rawBody, 'not-a-valid-hex-signature-zz')).toThrow(
      InvalidWebhookSignatureError,
    );
  });
});

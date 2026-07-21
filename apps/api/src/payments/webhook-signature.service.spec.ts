import { createHmac } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { WebhookSignatureService } from './webhook-signature.service';
import { InvalidWebhookSignatureError } from './errors/invalid-webhook-signature.error';

const SECRET = 'unit-test-paystack-secret';

function buildService(): WebhookSignatureService {
  const configService = { getOrThrow: jest.fn().mockReturnValue(SECRET) } as unknown as ConfigService;
  return new WebhookSignatureService(configService);
}

function sign(body: Buffer): string {
  return createHmac('sha512', SECRET).update(body).digest('hex');
}

describe('WebhookSignatureService.verifyPaystack', () => {
  it('accepts a signature computed correctly over the raw body', () => {
    const service = buildService();
    const rawBody = Buffer.from(JSON.stringify({ event: 'charge.success' }));

    expect(() => service.verifyPaystack(rawBody, sign(rawBody))).not.toThrow();
  });

  it('rejects a missing signature header', () => {
    const service = buildService();
    const rawBody = Buffer.from(JSON.stringify({ event: 'charge.success' }));

    expect(() => service.verifyPaystack(rawBody, undefined)).toThrow(InvalidWebhookSignatureError);
  });

  it('rejects a signature computed with the wrong secret', () => {
    const service = buildService();
    const rawBody = Buffer.from(JSON.stringify({ event: 'charge.success' }));
    const wrongSignature = createHmac('sha512', 'a-different-secret').update(rawBody).digest('hex');

    expect(() => service.verifyPaystack(rawBody, wrongSignature)).toThrow(InvalidWebhookSignatureError);
  });

  it('rejects a signature that does not match a tampered body', () => {
    const service = buildService();
    const originalBody = Buffer.from(JSON.stringify({ event: 'charge.success', data: { amount: 1000 } }));
    const signature = sign(originalBody);
    const tamperedBody = Buffer.from(JSON.stringify({ event: 'charge.success', data: { amount: 999999 } }));

    expect(() => service.verifyPaystack(tamperedBody, signature)).toThrow(InvalidWebhookSignatureError);
  });

  it('rejects a non-hex signature without throwing from the buffer comparison itself', () => {
    const service = buildService();
    const rawBody = Buffer.from(JSON.stringify({ event: 'charge.success' }));

    expect(() => service.verifyPaystack(rawBody, 'not-a-valid-hex-signature-zz')).toThrow(
      InvalidWebhookSignatureError,
    );
  });
});

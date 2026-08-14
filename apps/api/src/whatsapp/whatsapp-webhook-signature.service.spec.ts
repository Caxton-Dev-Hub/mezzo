import { createHmac } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { WhatsAppWebhookSignatureService } from './whatsapp-webhook-signature.service';
import { InvalidWhatsAppWebhookSignatureError } from './errors/invalid-webhook-signature.error';

const SECRET = 'test-app-secret';
const VERIFY_TOKEN = 'test-verify-token';

function buildService(): WhatsAppWebhookSignatureService {
  const configService = {
    getOrThrow: jest.fn((key: string) => {
      if (key === 'WHATSAPP_APP_SECRET') {
        return SECRET;
      }
      if (key === 'WHATSAPP_WEBHOOK_VERIFY_TOKEN') {
        return VERIFY_TOKEN;
      }
      throw new Error(`Unexpected config key ${key}`);
    }),
  };
  return new WhatsAppWebhookSignatureService(configService as unknown as ConfigService);
}

function sign(rawBody: string): string {
  return `sha256=${createHmac('sha256', SECRET).update(rawBody).digest('hex')}`;
}

describe('WhatsAppWebhookSignatureService.verify', () => {
  it('accepts a correctly signed payload', () => {
    const service = buildService();
    const rawBody = JSON.stringify({ hello: 'world' });

    expect(() => service.verify(Buffer.from(rawBody), sign(rawBody))).not.toThrow();
  });

  it('rejects a missing signature header', () => {
    const service = buildService();

    expect(() => service.verify(Buffer.from('{}'), undefined)).toThrow(
      InvalidWhatsAppWebhookSignatureError,
    );
  });

  it('rejects a malformed signature header', () => {
    const service = buildService();

    expect(() => service.verify(Buffer.from('{}'), 'not-a-signature')).toThrow(
      InvalidWhatsAppWebhookSignatureError,
    );
  });

  it('rejects a signature computed over a different body', () => {
    const service = buildService();
    const signature = sign(JSON.stringify({ hello: 'world' }));

    expect(() =>
      service.verify(Buffer.from(JSON.stringify({ hello: 'tampered' })), signature),
    ).toThrow(InvalidWhatsAppWebhookSignatureError);
  });
});

describe('WhatsAppWebhookSignatureService.verifyChallengeToken', () => {
  it('accepts the configured verify token', () => {
    const service = buildService();
    expect(service.verifyChallengeToken(VERIFY_TOKEN)).toBe(true);
  });

  it('rejects any other token', () => {
    const service = buildService();
    expect(service.verifyChallengeToken('wrong-token')).toBe(false);
    expect(service.verifyChallengeToken(undefined)).toBe(false);
  });
});

import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InvalidWebhookSignatureError } from './errors/invalid-webhook-signature.error';

@Injectable()
export class KycWebhookSignatureService {
  constructor(private readonly configService: ConfigService) {}

  verify(rawBody: Buffer, signatureHeader: string | undefined): void {
    if (this.configService.get<string>('KYC_PROVIDER') !== 'dojah') {
      return;
    }

    if (!signatureHeader) {
      throw new InvalidWebhookSignatureError();
    }

    const secret = this.configService.getOrThrow<string>('DOJAH_WEBHOOK_SECRET');
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');

    const expectedBuffer = Buffer.from(expected, 'hex');
    const receivedBuffer = Buffer.from(signatureHeader, 'hex');

    if (
      expectedBuffer.length !== receivedBuffer.length ||
      !timingSafeEqual(expectedBuffer, receivedBuffer)
    ) {
      throw new InvalidWebhookSignatureError();
    }
  }
}

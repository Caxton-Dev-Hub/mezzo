import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InvalidWebhookSignatureError } from './errors/invalid-webhook-signature.error';

@Injectable()
export class WebhookSignatureService {
  constructor(private readonly configService: ConfigService) {}

  verifyPaystack(rawBody: Buffer, signatureHeader: string | undefined): void {
    if (!signatureHeader) {
      throw new InvalidWebhookSignatureError();
    }

    const secret = this.configService.getOrThrow<string>('PAYSTACK_SECRET_KEY');
    const expected = createHmac('sha512', secret).update(rawBody).digest('hex');

    const expectedBuffer = Buffer.from(expected, 'hex');
    const receivedBuffer = Buffer.from(signatureHeader, 'hex');

    if (
      expectedBuffer.length !== receivedBuffer.length ||
      !timingSafeEqual(expectedBuffer, receivedBuffer)
    ) {
      throw new InvalidWebhookSignatureError();
    }
  }

  verifyFlutterwave(signatureHeader: string | undefined): void {
    if (!signatureHeader) {
      throw new InvalidWebhookSignatureError();
    }

    const expected = Buffer.from(
      this.configService.getOrThrow<string>('FLUTTERWAVE_SECRET_HASH'),
      'utf8',
    );
    const received = Buffer.from(signatureHeader, 'utf8');

    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      throw new InvalidWebhookSignatureError();
    }
  }
}

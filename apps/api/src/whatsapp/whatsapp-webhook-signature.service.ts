import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InvalidWhatsAppWebhookSignatureError } from './errors/invalid-webhook-signature.error';

@Injectable()
export class WhatsAppWebhookSignatureService {
  constructor(private readonly configService: ConfigService) {}

  verify(rawBody: Buffer, signatureHeader: string | undefined): void {
    if (!signatureHeader) {
      throw new InvalidWhatsAppWebhookSignatureError();
    }

    const [algo, receivedHex] = signatureHeader.split('=');
    if (algo !== 'sha256' || !receivedHex) {
      throw new InvalidWhatsAppWebhookSignatureError();
    }

    const secret = this.configService.getOrThrow<string>('WHATSAPP_APP_SECRET');
    const expectedHex = createHmac('sha256', secret).update(rawBody).digest('hex');

    const expectedBuffer = Buffer.from(expectedHex, 'hex');
    const receivedBuffer = Buffer.from(receivedHex, 'hex');

    if (
      expectedBuffer.length !== receivedBuffer.length ||
      !timingSafeEqual(expectedBuffer, receivedBuffer)
    ) {
      throw new InvalidWhatsAppWebhookSignatureError();
    }
  }

  verifyChallengeToken(token: string | undefined): boolean {
    return token === this.configService.getOrThrow<string>('WHATSAPP_WEBHOOK_VERIFY_TOKEN');
  }
}

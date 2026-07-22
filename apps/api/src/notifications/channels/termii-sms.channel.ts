import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationChannel, NotificationDeliveryRequest } from './notification-channel.interface';
import { notificationBody } from '../notification-copy';

@Injectable()
export class TermiiSmsChannel implements NotificationChannel {
  readonly name = 'TERMII';

  constructor(private readonly configService: ConfigService) {}

  async send(request: NotificationDeliveryRequest): Promise<void> {
    if (!request.recipientPhone) {
      return;
    }

    const apiKey = this.configService.getOrThrow<string>('TERMII_API_KEY');
    const baseUrl = this.configService.getOrThrow<string>('TERMII_BASE_URL');
    const senderId = this.configService.getOrThrow<string>('TERMII_SENDER_ID');

    const response = await fetch(`${baseUrl}/api/sms/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        to: request.recipientPhone,
        from: senderId,
        sms: notificationBody(request.eventType, request.escrowId),
        type: 'plain',
        channel: 'generic',
      }),
    });

    if (!response.ok) {
      throw new Error(`Termii delivery failed with status ${response.status}`);
    }
  }
}

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationChannel, NotificationDeliveryRequest } from './notification-channel.interface';
import { notificationBody, notificationSubject } from '../notification-copy';

@Injectable()
export class ResendEmailChannel implements NotificationChannel {
  readonly name = 'RESEND';

  constructor(private readonly configService: ConfigService) {}

  async send(request: NotificationDeliveryRequest): Promise<void> {
    const apiKey = this.configService.getOrThrow<string>('RESEND_API_KEY');
    const from = this.configService.getOrThrow<string>('RESEND_FROM_EMAIL');

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: request.recipientEmail,
        subject: notificationSubject(request.eventType),
        text: notificationBody(request.eventType, request.escrowId),
      }),
    });

    if (!response.ok) {
      throw new Error(`Resend delivery failed with status ${response.status}`);
    }
  }
}

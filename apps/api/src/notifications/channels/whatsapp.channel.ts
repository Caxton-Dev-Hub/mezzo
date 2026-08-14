import { Inject, Injectable } from '@nestjs/common';
import { NotificationChannel, NotificationDeliveryRequest } from './notification-channel.interface';
import { notificationBody } from '../notification-copy';
import { WHATSAPP_CLIENT, WhatsAppClient } from '../../whatsapp/client/whatsapp-client.interface';

@Injectable()
export class WhatsAppChannel implements NotificationChannel {
  readonly name = 'WHATSAPP';

  constructor(
    @Inject(WHATSAPP_CLIENT)
    private readonly client: WhatsAppClient,
  ) {}

  async send(request: NotificationDeliveryRequest): Promise<void> {
    if (!request.recipientWhatsapp) {
      return;
    }

    await this.client.sendText(
      request.recipientWhatsapp,
      notificationBody(request.eventType, request.escrowId),
    );
  }
}

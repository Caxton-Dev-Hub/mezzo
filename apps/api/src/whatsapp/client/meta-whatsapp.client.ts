import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WhatsAppButton, WhatsAppClient } from './whatsapp-client.interface';

@Injectable()
export class MetaWhatsAppClient implements WhatsAppClient {
  private readonly logger = new Logger(MetaWhatsAppClient.name);

  constructor(private readonly configService: ConfigService) {}

  async sendText(to: string, body: string): Promise<void> {
    await this.post({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body },
    });
  }

  async sendButtons(to: string, body: string, buttons: readonly WhatsAppButton[]): Promise<void> {
    await this.post({
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: body },
        action: {
          buttons: buttons.map((button) => ({
            type: 'reply',
            reply: { id: button.id, title: button.title },
          })),
        },
      },
    });
  }

  private async post(payload: Record<string, unknown>): Promise<void> {
    const baseUrl = this.configService.getOrThrow<string>('WHATSAPP_API_BASE_URL');
    const phoneNumberId = this.configService.getOrThrow<string>('WHATSAPP_PHONE_NUMBER_ID');
    const accessToken = this.configService.getOrThrow<string>('WHATSAPP_ACCESS_TOKEN');

    const response = await fetch(`${baseUrl}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      this.logger.warn(`WhatsApp delivery failed with status ${response.status}: ${detail}`);
      throw new Error(`WhatsApp delivery failed with status ${response.status}`);
    }
  }
}

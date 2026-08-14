import { Injectable } from '@nestjs/common';
import { WhatsAppButton, WhatsAppClient } from './whatsapp-client.interface';

export interface SentWhatsAppMessage {
  to: string;
  body: string;
  buttons?: readonly WhatsAppButton[];
}

@Injectable()
export class FakeWhatsAppClient implements WhatsAppClient {
  readonly sent: SentWhatsAppMessage[] = [];

  sendText(to: string, body: string): Promise<void> {
    this.sent.push({ to, body });
    return Promise.resolve();
  }

  sendButtons(to: string, body: string, buttons: readonly WhatsAppButton[]): Promise<void> {
    this.sent.push({ to, body, buttons });
    return Promise.resolve();
  }

  lastMessageTo(to: string): SentWhatsAppMessage | undefined {
    return [...this.sent].reverse().find((message) => message.to === to);
  }

  clear(): void {
    this.sent.length = 0;
  }
}

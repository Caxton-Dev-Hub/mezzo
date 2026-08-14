export interface WhatsAppButton {
  id: string;
  title: string;
}

export interface WhatsAppClient {
  sendText(to: string, body: string): Promise<void>;
  sendButtons(to: string, body: string, buttons: readonly WhatsAppButton[]): Promise<void>;
}

export const WHATSAPP_CLIENT = Symbol('WHATSAPP_CLIENT');

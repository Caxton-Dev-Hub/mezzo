import { NotificationChannelType } from '../entities/notification-channel-type.enum';
import { NotificationEventType } from '../entities/notification-event-type.enum';

export interface NotificationDeliveryRequest {
  userId: string;
  escrowId: string;
  eventType: NotificationEventType;
  channel: NotificationChannelType;
  recipientEmail: string;
  recipientPhone: string | null;
  recipientWhatsapp: string | null;
}

export interface NotificationChannel {
  readonly name: string;
  send(request: NotificationDeliveryRequest): Promise<void>;
}

export const EMAIL_CHANNEL = Symbol('EMAIL_CHANNEL');
export const SMS_CHANNEL = Symbol('SMS_CHANNEL');
export const WHATSAPP_CHANNEL = Symbol('WHATSAPP_CHANNEL');

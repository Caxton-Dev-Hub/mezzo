import { NotificationChannelType } from './entities/notification-channel-type.enum';
import { NotificationEventType } from './entities/notification-event-type.enum';

export const NOTIFICATION_QUEUE = 'notification-delivery';
export const NOTIFICATION_DELIVERY_JOB = 'deliver';

export interface NotificationDeliveryJobData {
  escrowId: string;
  userId: string;
  channel: NotificationChannelType;
  eventType: NotificationEventType;
  dedupeKey: string;
}

export function notificationDedupeKey(
  sourceEventId: string,
  channel: NotificationChannelType,
  userId: string,
): string {
  return `${sourceEventId}:${channel}:${userId}`;
}

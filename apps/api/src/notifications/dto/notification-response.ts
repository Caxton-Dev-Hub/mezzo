import { Notification } from '../../database/entities/notification.entity';
import { NotificationEventType } from '../entities/notification-event-type.enum';
import { NotificationChannelType } from '../entities/notification-channel-type.enum';
import { NotificationStatus } from '../entities/notification-status.enum';

export interface NotificationResponse {
  id: string;
  escrowId: string;
  eventType: NotificationEventType;
  channel: NotificationChannelType;
  status: NotificationStatus;
  isRead: boolean;
  readAt: Date | null;
  createdAt: Date;
  sentAt: Date | null;
}

export function toNotificationResponse(notification: Notification): NotificationResponse {
  return {
    id: notification.id,
    escrowId: notification.escrowId,
    eventType: notification.eventType,
    channel: notification.channel,
    status: notification.status,
    isRead: notification.isRead,
    readAt: notification.readAt,
    createdAt: notification.createdAt,
    sentAt: notification.sentAt,
  };
}

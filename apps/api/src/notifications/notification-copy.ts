import { NotificationEventType } from './entities/notification-event-type.enum';

const SUBJECTS: Record<NotificationEventType, string> = {
  [NotificationEventType.ESCROW_CREATED]: 'Your escrow invite is ready to share',
  [NotificationEventType.INVITED]: 'You were invited to an escrow',
  [NotificationEventType.AGREED]: 'Both parties agreed on terms',
  [NotificationEventType.FUNDED]: 'Escrow funded',
  [NotificationEventType.SHIPPED]: 'Item marked as shipped',
  [NotificationEventType.DELIVERED]: 'Delivery confirmed',
  [NotificationEventType.INSPECTION_ENDING_SOON]: 'Inspection window ending soon',
  [NotificationEventType.RELEASED]: 'Funds released',
  [NotificationEventType.DISPUTED]: 'A dispute was raised',
  [NotificationEventType.RESOLVED]: 'Your dispute was resolved',
};

export function notificationSubject(eventType: NotificationEventType): string {
  return SUBJECTS[eventType];
}

export function notificationBody(eventType: NotificationEventType, escrowId: string): string {
  return `${notificationSubject(eventType)} for escrow ${escrowId}.`;
}

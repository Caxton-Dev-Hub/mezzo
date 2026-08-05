import type { NotificationEventType } from '@mezzo/shared-types';

export const NOTIFICATION_EVENT_LABELS: Record<NotificationEventType, string> = {
  ESCROW_CREATED: 'Escrow created — invite link ready to share',
  INVITED: 'You were invited to an escrow',
  AGREED: 'Both parties agreed to the terms',
  FUNDED: 'The escrow was funded',
  SHIPPED: 'The item was shipped',
  DELIVERED: 'The item was marked delivered',
  INSPECTION_ENDING_SOON: 'The inspection window is ending soon',
  RELEASED: 'Funds were released',
  DISPUTED: 'A dispute was raised',
  RESOLVED: 'The dispute was resolved',
};

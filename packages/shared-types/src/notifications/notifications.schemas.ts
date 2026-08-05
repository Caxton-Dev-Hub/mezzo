import { z } from 'zod';

export const notificationEventTypeSchema = z.enum([
  'ESCROW_CREATED',
  'INVITED',
  'AGREED',
  'FUNDED',
  'SHIPPED',
  'DELIVERED',
  'INSPECTION_ENDING_SOON',
  'RELEASED',
  'DISPUTED',
  'RESOLVED',
]);

export type NotificationEventType = z.infer<typeof notificationEventTypeSchema>;

export const notificationChannelTypeSchema = z.enum(['EMAIL', 'SMS']);

export type NotificationChannelType = z.infer<typeof notificationChannelTypeSchema>;

export const notificationStatusSchema = z.enum(['PENDING', 'SENT', 'FAILED']);

export type NotificationStatus = z.infer<typeof notificationStatusSchema>;

export const notificationResponseSchema = z.object({
  id: z.string().uuid(),
  escrowId: z.string().uuid(),
  eventType: notificationEventTypeSchema,
  channel: notificationChannelTypeSchema,
  status: notificationStatusSchema,
  isRead: z.boolean(),
  readAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  sentAt: z.coerce.date().nullable(),
});

export type NotificationResponse = z.infer<typeof notificationResponseSchema>;

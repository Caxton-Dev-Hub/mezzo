import { z } from 'zod';

import { evidenceItemResponseSchema } from '../evidence';

export const sendMessageSchema = z
  .object({
    body: z.string().max(4_000).default(''),
    attachmentEvidenceItemId: z.string().uuid().optional(),
  })
  .refine((dto) => dto.body.trim().length > 0 || dto.attachmentEvidenceItemId !== undefined, {
    message: 'A message requires a body or an attachment',
  });

export type SendMessageDto = z.infer<typeof sendMessageSchema>;

export const chatMessageResponseSchema = z.object({
  id: z.string().uuid(),
  escrowId: z.string().uuid(),
  senderId: z.string().uuid(),
  body: z.string(),
  attachment: evidenceItemResponseSchema.nullable(),
  createdAt: z.coerce.date(),
});

export type ChatMessageResponse = z.infer<typeof chatMessageResponseSchema>;

export const chatReadStateSchema = z.object({
  userId: z.string().uuid(),
  lastReadAt: z.coerce.date(),
});

export type ChatReadState = z.infer<typeof chatReadStateSchema>;

export const socketRejectionSchema = z.object({
  code: z.enum(['UNAUTHORIZED', 'FORBIDDEN']),
});

export type SocketRejection = z.infer<typeof socketRejectionSchema>;

export const escrowUpdatedEventSchema = z.object({
  escrowId: z.string().uuid(),
  eventType: z.string(),
  occurredAt: z.coerce.date(),
});

export type EscrowUpdatedEvent = z.infer<typeof escrowUpdatedEventSchema>;

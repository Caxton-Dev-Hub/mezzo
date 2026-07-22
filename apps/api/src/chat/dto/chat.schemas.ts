import { z } from 'zod';

export const sendMessageSchema = z
  .object({
    body: z.string().max(4_000).default(''),
    attachmentEvidenceItemId: z.string().uuid().optional(),
  })
  .refine((data) => data.body.trim().length > 0 || data.attachmentEvidenceItemId !== undefined, {
    message: 'Message must include text or an attachment',
  });

export type SendMessageDto = z.infer<typeof sendMessageSchema>;

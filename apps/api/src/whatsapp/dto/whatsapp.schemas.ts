import { z } from 'zod';

export const startWhatsAppLinkSchema = z.object({
  phoneNumber: z
    .string()
    .trim()
    .regex(/^\+?[1-9]\d{6,14}$/, 'phoneNumber must be an E.164-style phone number'),
});

export type StartWhatsAppLinkDto = z.infer<typeof startWhatsAppLinkSchema>;

const whatsAppInteractiveReplySchema = z.object({
  type: z.literal('button_reply'),
  button_reply: z.object({ id: z.string(), title: z.string().optional() }),
});

const whatsAppMessageSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  timestamp: z.string().optional(),
  type: z.string(),
  text: z.object({ body: z.string() }).optional(),
  interactive: whatsAppInteractiveReplySchema.optional(),
});

const whatsAppChangeValueSchema = z.object({
  messaging_product: z.literal('whatsapp').optional(),
  messages: z.array(whatsAppMessageSchema).optional(),
  statuses: z.array(z.unknown()).optional(),
});

const whatsAppChangeSchema = z.object({
  field: z.string(),
  value: whatsAppChangeValueSchema,
});

const whatsAppEntrySchema = z.object({
  id: z.string(),
  changes: z.array(whatsAppChangeSchema),
});

export const whatsAppWebhookEventSchema = z.object({
  object: z.string(),
  entry: z.array(whatsAppEntrySchema).default([]),
});

export type WhatsAppWebhookEventDto = z.infer<typeof whatsAppWebhookEventSchema>;
export type WhatsAppInboundMessage = z.infer<typeof whatsAppMessageSchema>;

export interface NormalizedInboundMessage {
  waMessageId: string;
  from: string;
  text: string | null;
  buttonReplyId: string | null;
}

export function extractInboundMessages(event: WhatsAppWebhookEventDto): NormalizedInboundMessage[] {
  const messages: NormalizedInboundMessage[] = [];

  for (const entry of event.entry) {
    for (const change of entry.changes) {
      for (const message of change.value.messages ?? []) {
        messages.push({
          waMessageId: message.id,
          from: message.from,
          text: message.text?.body ?? null,
          buttonReplyId: message.interactive?.button_reply.id ?? null,
        });
      }
    }
  }

  return messages;
}

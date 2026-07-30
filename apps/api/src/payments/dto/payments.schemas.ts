import { z } from 'zod';

export const paystackWebhookSchema = z.object({
  event: z.string().min(1),
  data: z.object({
    id: z.union([z.number(), z.string()]),
    reference: z.string().min(1),
    amount: z.number().int().nonnegative(),
    currency: z.string().length(3),
    status: z.string(),
  }),
});

export type PaystackWebhookDto = z.infer<typeof paystackWebhookSchema>;

export const flutterwaveWebhookSchema = z.object({
  event: z.string().min(1),
  data: z.object({
    id: z.union([z.number(), z.string()]),
    tx_ref: z.string().min(1).optional(),
    reference: z.string().min(1).optional(),
    amount: z.union([z.number().nonnegative(), z.string().min(1)]),
    currency: z.string().length(3),
    status: z.string(),
  }),
});

export type FlutterwaveWebhookDto = z.infer<typeof flutterwaveWebhookSchema>;

export const reconciliationWindowSchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
});

export type ReconciliationWindowDto = z.infer<typeof reconciliationWindowSchema>;

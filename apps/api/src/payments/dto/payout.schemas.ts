import { z } from 'zod';

export const requestPayoutSchema = z.object({
  amount: z.object({
    amount: z.number().int().positive(),
    currency: z.enum(['NGN', 'USD']),
  }),
  bankAccountNumber: z.string().trim().min(1).max(32),
  bankCode: z.string().trim().min(1).max(32),
  idempotencyKey: z.string().uuid(),
});

export type RequestPayoutDto = z.infer<typeof requestPayoutSchema>;

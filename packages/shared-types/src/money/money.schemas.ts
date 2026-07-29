import { z } from 'zod';

export const currencySchema = z.enum(['NGN', 'USD']);

export type Currency = z.infer<typeof currencySchema>;

export const moneySchema = z.object({
  amount: z.number().int().nonnegative(),
  currency: currencySchema,
});

export type Money = z.infer<typeof moneySchema>;

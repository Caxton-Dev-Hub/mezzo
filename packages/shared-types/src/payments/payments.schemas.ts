import { z } from 'zod';
import { currencySchema, moneySchema } from '../money/money.schemas';

export const paymentIntentStatusSchema = z.enum(['PENDING', 'FUNDED', 'QUARANTINED']);

export type PaymentIntentStatus = z.infer<typeof paymentIntentStatusSchema>;

export const paymentIntentResponseSchema = z.object({
  id: z.string().uuid(),
  escrowId: z.string().uuid(),
  amount: z.number().int().nonnegative(),
  currency: currencySchema,
  status: paymentIntentStatusSchema,
  reference: z.string().min(1),
  authorizationUrl: z.string().url().nullable(),
});

export type PaymentIntentResponse = z.infer<typeof paymentIntentResponseSchema>;

export const latestPaymentIntentResponseSchema = z.object({
  intent: paymentIntentResponseSchema.nullable(),
});

export type LatestPaymentIntentResponse = z.infer<typeof latestPaymentIntentResponseSchema>;

export const payoutStatusSchema = z.enum(['PENDING', 'CONFIRMED', 'FAILED']);

export type PayoutStatus = z.infer<typeof payoutStatusSchema>;

export const requestPayoutSchema = z.object({
  amount: moneySchema.extend({ amount: z.number().int().positive() }),
  bankAccountNumber: z.string().trim().min(1).max(32),
  bankCode: z.string().trim().min(1).max(32),
  idempotencyKey: z.string().uuid(),
});

export type RequestPayoutDto = z.infer<typeof requestPayoutSchema>;

export const payoutResponseSchema = z.object({
  id: z.string().uuid(),
  sellerId: z.string().uuid(),
  amount: z.number().int().nonnegative(),
  currency: currencySchema,
  status: payoutStatusSchema,
  reference: z.string().min(1),
  createdAt: z.coerce.date(),
});

export type PayoutResponse = z.infer<typeof payoutResponseSchema>;

export const walletBalancesResponseSchema = z.object({
  available: moneySchema,
  pending: moneySchema,
  heldInEscrow: moneySchema,
});

export type WalletBalancesResponse = z.infer<typeof walletBalancesResponseSchema>;

export const walletActivityKindSchema = z.enum([
  'ESCROW_FUNDING',
  'ESCROW_RELEASE',
  'ESCROW_REFUND',
  'DISPUTE_RESOLUTION',
  'PAYOUT',
  'PAYOUT_REVERSAL',
  'OTHER',
]);

export type WalletActivityKind = z.infer<typeof walletActivityKindSchema>;

export const walletActivityDirectionSchema = z.enum(['IN', 'OUT']);

export type WalletActivityDirection = z.infer<typeof walletActivityDirectionSchema>;

export const walletActivityResponseSchema = z.object({
  id: z.string().min(1),
  kind: walletActivityKindSchema,
  direction: walletActivityDirectionSchema,
  amount: moneySchema,
  escrowId: z.string().uuid().nullable(),
  occurredAt: z.coerce.date(),
});

export type WalletActivityResponse = z.infer<typeof walletActivityResponseSchema>;

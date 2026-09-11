import { z } from 'zod';
import { moneySchema } from '../money/money.schemas';

export const stellarNetworkSchema = z.enum(['testnet', 'public']);

export type StellarNetworkName = z.infer<typeof stellarNetworkSchema>;

export const stellarAccountIdSchema = z
  .string()
  .trim()
  .regex(/^G[A-Z2-7]{55}$/, 'Not a Stellar account id');

export const stellarTransactionHashSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-f]{64}$/, 'Not a Stellar transaction hash');

export const stellarAssetSchema = z.object({
  code: z.string().min(1).max(12),
  issuer: stellarAccountIdSchema,
});

export type StellarAsset = z.infer<typeof stellarAssetSchema>;

export const stellarRailConfigResponseSchema = z.object({
  enabled: z.boolean(),
  network: stellarNetworkSchema,
  asset: stellarAssetSchema.nullable(),
});

export type StellarRailConfigResponse = z.infer<typeof stellarRailConfigResponseSchema>;

export const linkStellarAccountSchema = z.object({
  accountId: stellarAccountIdSchema,
});

export type LinkStellarAccountDto = z.infer<typeof linkStellarAccountSchema>;

export const stellarAccountResponseSchema = z.object({
  accountId: stellarAccountIdSchema,
  network: stellarNetworkSchema,
  linkedAt: z.coerce.date(),
});

export type StellarAccountResponse = z.infer<typeof stellarAccountResponseSchema>;

export const stellarEscrowStatusSchema = z.enum(['AWAITING_DEPOSIT', 'FUNDED', 'SETTLED']);

export type StellarEscrowStatus = z.infer<typeof stellarEscrowStatusSchema>;

export const stellarEscrowResponseSchema = z.object({
  escrowId: z.string().uuid(),
  status: stellarEscrowStatusSchema,
  network: stellarNetworkSchema,
  depositAccountId: stellarAccountIdSchema,
  memo: z.string().min(1),
  asset: stellarAssetSchema,
  expected: moneySchema,
  expectedAssetAmount: z.string().min(1),
  fundingTransactionHash: stellarTransactionHashSchema.nullable(),
  settlementTransactionHash: stellarTransactionHashSchema.nullable(),
});

export type StellarEscrowResponse = z.infer<typeof stellarEscrowResponseSchema>;

export const confirmStellarDepositSchema = z.object({
  transactionHash: stellarTransactionHashSchema,
});

export type ConfirmStellarDepositDto = z.infer<typeof confirmStellarDepositSchema>;

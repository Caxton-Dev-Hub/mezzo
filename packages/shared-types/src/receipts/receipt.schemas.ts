import { z } from 'zod';
import { moneySchema } from '../money/money.schemas';
import { escrowStateSchema } from '../escrow/escrow.schemas';

export const receiptResponseSchema = z.object({
  escrowId: z.string().uuid(),
  escrowCode: z.string(),
  state: escrowStateSchema,
  itemDescription: z.string(),
  deliveryMethod: z.string(),
  price: moneySchema,
  feeBps: z.number().int(),
  feeAmount: moneySchema,
  netAmount: moneySchema,
  buyerEmail: z.string(),
  sellerEmail: z.string(),
  createdAt: z.coerce.date(),
  fundedAt: z.coerce.date().nullable(),
  releasedAt: z.coerce.date().nullable(),
  paymentReference: z.string().nullable(),
});

export type ReceiptResponse = z.infer<typeof receiptResponseSchema>;

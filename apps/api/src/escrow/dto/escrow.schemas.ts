import { z } from 'zod';
import { EscrowRole } from '../entities/escrow-role.enum';

const moneySchema = z.object({
  amount: z.number().int().nonnegative(),
  currency: z.enum(['NGN', 'USD']),
});

const termsSchema = {
  price: moneySchema,
  inspectionWindowHours: z.number().int().positive(),
  deliveryMethod: z.string().trim().min(1).max(255),
  itemDescription: z.string().trim().min(1),
  feeBps: z.number().int().min(0).max(10_000),
};

export const createEscrowSchema = z.object({
  role: z.nativeEnum(EscrowRole),
  ...termsSchema,
});

export type CreateEscrowDto = z.infer<typeof createEscrowSchema>;

export const updateEscrowTermsSchema = z.object(termsSchema);

export type UpdateEscrowTermsDto = z.infer<typeof updateEscrowTermsSchema>;

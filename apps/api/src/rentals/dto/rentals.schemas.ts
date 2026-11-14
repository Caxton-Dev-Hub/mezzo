import { z } from 'zod';

export const checkoutSchema = z.object({
  powerbankId: z.string().uuid(),
  shopId: z.string().uuid(),
});

export type CheckoutDto = z.infer<typeof checkoutSchema>;

export const checkinSchema = z.object({
  rentalId: z.string().uuid(),
});

export type CheckinDto = z.infer<typeof checkinSchema>;

export const markUnreturnedSchema = z.object({
  rentalId: z.string().uuid(),
  reason: z.string().optional(),
});

export type MarkUnreturnedDto = z.infer<typeof markUnreturnedSchema>;

export const chargeReplacementSchema = z.object({
  rentalId: z.string().uuid(),
  reason: z.string().optional(),
});

export type ChargeReplacementDto = z.infer<typeof chargeReplacementSchema>;

export const reverseReplacementSchema = z.object({
  rentalId: z.string().uuid(),
  reason: z.string().optional(),
});

export type ReverseReplacementDto = z.infer<typeof reverseReplacementSchema>;

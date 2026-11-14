import { z } from 'zod';

export const createAccessorySchema = z.object({
  shopId: z.string().uuid(),
  name: z.string().min(1).max(255),
  priceAmount: z.number().int().min(0),
  priceCurrency: z.enum(['NGN', 'USD']),
  stockLevel: z.number().int().min(0),
});

export type CreateAccessoryDto = z.infer<typeof createAccessorySchema>;

export const updateAccessorySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  priceAmount: z.number().int().min(0).optional(),
  priceCurrency: z.enum(['NGN', 'USD']).optional(),
  stockLevel: z.number().int().min(0).optional(),
});

export type UpdateAccessoryDto = z.infer<typeof updateAccessorySchema>;

export const recordSaleSchema = z.object({
  accessoryId: z.string().uuid(),
  quantity: z.number().int().min(1),
});

export type RecordSaleDto = z.infer<typeof recordSaleSchema>;

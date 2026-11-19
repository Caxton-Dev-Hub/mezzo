import { z } from 'zod';

export const createPowerbankSchema = z.object({
  shopId: z.string().uuid(),
  number: z.string().regex(/^[1-9][0-9]?$/, 'Number must be between 1 and 99'),
});

export type CreatePowerbankDto = z.infer<typeof createPowerbankSchema>;

export const updatePowerbankStatusSchema = z.object({
  status: z.enum(['AVAILABLE', 'MAINTENANCE']),
});

export type UpdatePowerbankStatusDto = z.infer<typeof updatePowerbankStatusSchema>;

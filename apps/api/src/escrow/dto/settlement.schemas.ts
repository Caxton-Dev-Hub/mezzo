import { z } from 'zod';

export const shipEscrowSchema = z.object({
  trackingReference: z.string().trim().min(1).max(255).optional(),
});

export type ShipEscrowDto = z.infer<typeof shipEscrowSchema>;

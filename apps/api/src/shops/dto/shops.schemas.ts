import { z } from 'zod';

export const createShopSchema = z.object({
  name: z.string().min(1).max(255),
  location: z.string().min(1).max(255),
});

export type CreateShopDto = z.infer<typeof createShopSchema>;

export const assignStaffSchema = z.object({
  userId: z.string().uuid(),
});

export type AssignStaffDto = z.infer<typeof assignStaffSchema>;

export const submitVerificationSchema = z.object({
  fullName: z.string().min(1).max(255),
  phoneNumber: z.string().min(1).max(32),
  photoStorageKey: z.string().min(1),
});

export type SubmitVerificationDto = z.infer<typeof submitVerificationSchema>;

export const reviewVerificationSchema = z.object({
  notes: z.string().optional(),
});

export type ReviewVerificationDto = z.infer<typeof reviewVerificationSchema>;

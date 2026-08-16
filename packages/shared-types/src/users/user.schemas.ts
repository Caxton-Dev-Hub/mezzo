import { z } from 'zod';

export const userRoleSchema = z.enum(['USER', 'ARBITER', 'ADMIN']);

export type UserRole = z.infer<typeof userRoleSchema>;

export const userStatusSchema = z.enum(['ACTIVE', 'SUSPENDED']);

export type UserStatus = z.infer<typeof userStatusSchema>;

export const userResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: userRoleSchema,
  emailVerified: z.boolean(),
  createdAt: z.coerce.date(),
});

export type UserResponse = z.infer<typeof userResponseSchema>;

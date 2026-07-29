import { z } from 'zod';

export const userRoleSchema = z.enum(['USER', 'ARBITER', 'ADMIN']);

export type UserRole = z.infer<typeof userRoleSchema>;

export const userResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: userRoleSchema,
  createdAt: z.coerce.date(),
});

export type UserResponse = z.infer<typeof userResponseSchema>;

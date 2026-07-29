import { z } from 'zod';
import { userResponseSchema } from '../users/user.schemas';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export type RegisterDto = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginDto = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export type RefreshDto = z.infer<typeof refreshSchema>;

export const tokenPairSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
});

export type TokenPair = z.infer<typeof tokenPairSchema>;

export const loginResponseSchema = tokenPairSchema.extend({
  user: userResponseSchema,
});

export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const registerResponseSchema = userResponseSchema;

export type RegisterResponse = z.infer<typeof registerResponseSchema>;

export const refreshResponseSchema = tokenPairSchema;

export type RefreshResponse = z.infer<typeof refreshResponseSchema>;

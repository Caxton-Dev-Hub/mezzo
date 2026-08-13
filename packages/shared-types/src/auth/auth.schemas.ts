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

export const googleLoginSchema = z.object({
  idToken: z.string().min(1),
});

export type GoogleLoginDto = z.infer<typeof googleLoginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export type RefreshDto = z.infer<typeof refreshSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export type ForgotPasswordDto = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});

export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;

export const verifyEmailSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
});

export type VerifyEmailDto = z.infer<typeof verifyEmailSchema>;

export const resendVerificationSchema = z.object({
  email: z.string().email(),
});

export type ResendVerificationDto = z.infer<typeof resendVerificationSchema>;

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

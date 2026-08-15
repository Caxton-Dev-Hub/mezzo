import { z } from 'zod';

export const joinWaitlistSchema = z.object({
  email: z.string().email(),
});

export type JoinWaitlistDto = z.infer<typeof joinWaitlistSchema>;

export const waitlistSignupResponseSchema = z.object({
  email: z.string().email(),
  createdAt: z.coerce.date(),
});

export type WaitlistSignupResponse = z.infer<typeof waitlistSignupResponseSchema>;

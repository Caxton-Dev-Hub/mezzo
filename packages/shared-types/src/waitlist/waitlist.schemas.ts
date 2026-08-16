import { z } from 'zod';
import { paginationQuerySchema } from '../common/pagination.schemas';

export const joinWaitlistSchema = z.object({
  email: z.string().email(),
});

export type JoinWaitlistDto = z.infer<typeof joinWaitlistSchema>;

export const waitlistSignupResponseSchema = z.object({
  email: z.string().email(),
  createdAt: z.coerce.date(),
});

export type WaitlistSignupResponse = z.infer<typeof waitlistSignupResponseSchema>;

export const adminWaitlistListQuerySchema = paginationQuerySchema;

export type AdminWaitlistListQuery = z.infer<typeof adminWaitlistListQuerySchema>;

export const adminWaitlistListResponseSchema = z.object({
  items: z.array(waitlistSignupResponseSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});

export type AdminWaitlistListResponse = z.infer<typeof adminWaitlistListResponseSchema>;

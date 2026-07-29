import { z } from 'zod';

export { submitKycSchema, type SubmitKycDto } from '@mezzo/shared-types';

export const kycWebhookSchema = z.object({
  providerReference: z.string().min(1),
  status: z.enum(['APPROVED', 'REJECTED', 'EXPIRED']),
});

export type KycWebhookDto = z.infer<typeof kycWebhookSchema>;

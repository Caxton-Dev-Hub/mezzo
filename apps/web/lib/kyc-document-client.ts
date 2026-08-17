import type {
  ConfirmKycDocumentDto,
  KycDocumentResponse,
  KycVerificationResponse,
  PresignKycDocumentDto,
  PresignKycDocumentResponse,
  SubmitManualKycDto,
} from '@mezzo/shared-types';
import { apiRequest } from './api-client';

export function presignKycDocument(
  dto: PresignKycDocumentDto,
): Promise<PresignKycDocumentResponse> {
  return apiRequest<PresignKycDocumentResponse>('/kyc/documents/presign', {
    method: 'POST',
    body: dto,
  });
}

export function confirmKycDocument(dto: ConfirmKycDocumentDto): Promise<KycDocumentResponse> {
  return apiRequest<KycDocumentResponse>('/kyc/documents/confirm', { method: 'POST', body: dto });
}

export function submitManualKyc(dto: SubmitManualKycDto): Promise<KycVerificationResponse> {
  return apiRequest<KycVerificationResponse>('/kyc/manual-submissions', {
    method: 'POST',
    body: dto,
  });
}

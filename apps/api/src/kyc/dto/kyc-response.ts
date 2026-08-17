import {
  KycStatusResponse,
  KycVerificationResponse,
  PresignKycDocumentResponse,
  KycDocumentResponse,
} from '@mezzo/shared-types';
import { KycVerification } from '../../database/entities/kyc-verification.entity';
import { KycDocument } from '../../database/entities/kyc-document.entity';

export type { KycStatusResponse, KycVerificationResponse, PresignKycDocumentResponse };

export function toKycVerificationResponse(verification: KycVerification): KycVerificationResponse {
  return {
    id: verification.id,
    status: verification.status,
    requestedTier: verification.requestedTier,
    providerReference: verification.providerReference,
    createdAt: verification.createdAt,
  };
}

export function toKycDocumentResponse(document: KycDocument, url?: string): KycDocumentResponse {
  return {
    id: document.id,
    documentType: document.documentType,
    declaredMime: document.declaredMime,
    detectedMime: document.detectedMime,
    sizeBytes: document.sizeBytes,
    width: document.width,
    height: document.height,
    ...(url ? { url } : {}),
    createdAt: document.createdAt,
  };
}

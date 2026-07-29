import type {
  ConfirmEvidenceDto,
  EvidenceBundleResponse,
  EvidenceItemResponse,
  PresignEvidenceDto,
  PresignEvidenceResponse,
} from '@mezzo/shared-types';
import { apiRequest } from './api-client';
import { ApiError } from './api-error';

export function presignEvidence(dto: PresignEvidenceDto): Promise<PresignEvidenceResponse> {
  return apiRequest<PresignEvidenceResponse>('/evidence/presign', { method: 'POST', body: dto });
}

export function confirmEvidence(dto: ConfirmEvidenceDto): Promise<EvidenceItemResponse> {
  return apiRequest<EvidenceItemResponse>('/evidence/confirm', { method: 'POST', body: dto });
}

export function getEvidenceBundle(escrowId: string): Promise<EvidenceBundleResponse> {
  return apiRequest<EvidenceBundleResponse>(`/evidence/${escrowId}`);
}

export function uploadFileToPresignedUrl(
  uploadUrl: string,
  file: Blob,
  contentType: string,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', contentType);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(event.loaded / event.total);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(
          new ApiError({
            statusCode: xhr.status,
            code: 'UPLOAD_FAILED',
            message: 'The upload failed. Please try again.',
          }),
        );
      }
    };

    xhr.onerror = () => {
      reject(
        new ApiError({
          statusCode: 0,
          code: 'UPLOAD_NETWORK_ERROR',
          message: 'The upload failed. Check your connection and try again.',
        }),
      );
    };

    xhr.send(file);
  });
}

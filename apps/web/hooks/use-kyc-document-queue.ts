import { useCallback, useState } from 'react';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  type KycDocumentResponse,
  type KycDocumentType,
  type PresignKycDocumentDto,
} from '@mezzo/shared-types';

type KycDocumentMimeType = PresignKycDocumentDto['mimeType'];
import { compressImage } from '../lib/image-compression';
import { confirmKycDocument, presignKycDocument } from '../lib/kyc-document-client';
import { uploadFileToPresignedUrl } from '../lib/evidence-client';
import { ApiError } from '../lib/api-error';

export type KycDocumentSlotStatus = 'idle' | 'uploading' | 'confirmed' | 'error';

export interface KycDocumentSlot {
  status: KycDocumentSlotStatus;
  previewUrl: string | null;
  progress: number;
  errorMessage?: string;
  confirmed?: KycDocumentResponse;
}

const MAX_UPLOAD_MB = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB ?? '25');

function emptySlot(): KycDocumentSlot {
  return { status: 'idle', previewUrl: null, progress: 0 };
}

export function useKycDocumentQueue(documentTypes: readonly KycDocumentType[]) {
  const [slots, setSlots] = useState<Record<string, KycDocumentSlot>>(() =>
    Object.fromEntries(documentTypes.map((type) => [type, emptySlot()])),
  );

  const updateSlot = useCallback(
    (documentType: KycDocumentType, patch: Partial<KycDocumentSlot>) => {
      setSlots((current) => ({
        ...current,
        [documentType]: { ...current[documentType], ...patch },
      }));
    },
    [],
  );

  const uploadDocument = useCallback(
    async (documentType: KycDocumentType, file: File) => {
      const previewUrl = URL.createObjectURL(file);
      updateSlot(documentType, {
        status: 'uploading',
        previewUrl,
        progress: 0,
        errorMessage: undefined,
      });

      try {
        let uploadBlob: Blob = file;
        let mimeType = file.type;
        try {
          const compressed = await compressImage(file);
          uploadBlob = compressed.blob;
          mimeType = compressed.mimeType;
        } catch {
          uploadBlob = file;
          mimeType = file.type;
        }

        if (!(ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType)) {
          updateSlot(documentType, {
            status: 'error',
            errorMessage: 'That file type is not supported. Use JPEG, PNG, WEBP, or HEIC.',
          });
          return;
        }

        const sizeMb = uploadBlob.size / (1024 * 1024);
        if (sizeMb > MAX_UPLOAD_MB) {
          updateSlot(documentType, {
            status: 'error',
            errorMessage: `This file is ${sizeMb.toFixed(1)} MB, over the ${MAX_UPLOAD_MB} MB limit.`,
          });
          return;
        }

        const imageMimeType = mimeType as KycDocumentMimeType;
        const { uploadUrl, key } = await presignKycDocument({
          documentType,
          mimeType: imageMimeType,
        });
        await uploadFileToPresignedUrl(uploadUrl, uploadBlob, imageMimeType, (fraction) => {
          updateSlot(documentType, { progress: fraction });
        });
        const confirmed = await confirmKycDocument({
          key,
          documentType,
          declaredMime: imageMimeType,
        });
        updateSlot(documentType, { status: 'confirmed', progress: 1, confirmed });
      } catch (error) {
        const message =
          error instanceof ApiError ? error.message : 'The upload failed. Please try again.';
        updateSlot(documentType, { status: 'error', errorMessage: message });
      }
    },
    [updateSlot],
  );

  const confirmedDocumentIds = documentTypes
    .map((type) => slots[type]?.confirmed?.id)
    .filter((id): id is string => Boolean(id));

  const allConfirmed = confirmedDocumentIds.length === documentTypes.length;

  return { slots, uploadDocument, confirmedDocumentIds, allConfirmed };
}

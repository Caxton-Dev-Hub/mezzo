import { useCallback, useState } from 'react';
import { ALLOWED_MIME_TYPES, type AllowedMimeType, type EvidenceItemResponse } from '@mezzo/shared-types';
import { compressImage } from '../lib/image-compression';
import { confirmEvidence, presignEvidence, uploadFileToPresignedUrl } from '../lib/evidence-client';
import { ApiError } from '../lib/api-error';

export type ChatAttachmentStatus = 'idle' | 'uploading' | 'confirmed' | 'error';

interface ChatAttachmentState {
  status: ChatAttachmentStatus;
  fileName: string | null;
  confirmed: EvidenceItemResponse | null;
  errorMessage: string | null;
}

const initialState: ChatAttachmentState = {
  status: 'idle',
  fileName: null,
  confirmed: null,
  errorMessage: null,
};

export function useChatAttachment(escrowId: string) {
  const [state, setState] = useState<ChatAttachmentState>(initialState);

  const attach = useCallback(
    async (file: File) => {
      if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
        setState({
          status: 'error',
          fileName: file.name,
          confirmed: null,
          errorMessage: 'That file type is not supported.',
        });
        return;
      }

      setState({ status: 'uploading', fileName: file.name, confirmed: null, errorMessage: null });

      try {
        let uploadBlob: Blob = file;
        let mimeType = file.type as AllowedMimeType;
        if (file.type.startsWith('image/')) {
          try {
            const compressed = await compressImage(file);
            uploadBlob = compressed.blob;
            mimeType = compressed.mimeType as AllowedMimeType;
          } catch {
            uploadBlob = file;
            mimeType = file.type as AllowedMimeType;
          }
        }

        const presigned = await presignEvidence({ escrowId, phase: 'CHAT', mimeType });
        await uploadFileToPresignedUrl(presigned.uploadUrl, uploadBlob, mimeType);
        const confirmed = await confirmEvidence({
          escrowId,
          phase: 'CHAT',
          key: presigned.key,
          declaredMime: mimeType,
        });
        setState({ status: 'confirmed', fileName: file.name, confirmed, errorMessage: null });
      } catch (error) {
        const message = error instanceof ApiError ? error.message : 'The upload failed. Please try again.';
        setState({ status: 'error', fileName: file.name, confirmed: null, errorMessage: message });
      }
    },
    [escrowId],
  );

  const clear = useCallback(() => setState(initialState), []);

  return { ...state, attach, clear };
}

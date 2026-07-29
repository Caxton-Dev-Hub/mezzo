import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ALLOWED_MIME_TYPES,
  isImageMime,
  type AllowedMimeType,
  type EvidenceItemResponse,
  type EvidencePhase,
} from '@mezzo/shared-types';
import { compressImage } from '../lib/image-compression';
import { confirmEvidence, getEvidenceBundle, presignEvidence, uploadFileToPresignedUrl } from '../lib/evidence-client';
import { ApiError } from '../lib/api-error';

export type EvidenceQueueStatus = 'compressing' | 'uploading' | 'confirmed' | 'error';
export type EvidenceQueueErrorReason = 'unsupported_type' | 'too_large' | 'upload_failed';

export interface EvidenceQueueItem {
  clientId: string;
  sourceFile: File;
  kind: 'image' | 'video';
  previewUrl: string | null;
  status: EvidenceQueueStatus;
  progress: number;
  errorReason?: EvidenceQueueErrorReason;
  errorMessage?: string;
  confirmed?: EvidenceItemResponse;
}

const MAX_UPLOAD_MB = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB ?? '25');

function detectKind(mimeType: string): 'image' | 'video' {
  return isImageMime(mimeType) ? 'image' : 'video';
}

let clientIdCounter = 0;
function nextClientId(): string {
  clientIdCounter += 1;
  return `local-${Date.now()}-${clientIdCounter}`;
}

export function useEvidenceQueue(escrowId: string, phase: EvidencePhase) {
  const [items, setItems] = useState<EvidenceQueueItem[]>([]);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getEvidenceBundle(escrowId)
      .then((bundle) => {
        if (cancelled) return;
        const existing = bundle.items
          .filter((item) => item.phase === phase)
          .map<EvidenceQueueItem>((item) => ({
            clientId: item.id,
            sourceFile: new File([], 'existing'),
            kind: detectKind(item.declaredMime),
            previewUrl: null,
            status: 'confirmed',
            progress: 1,
            confirmed: item,
          }));
        setItems((current) => [...existing, ...current]);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [escrowId, phase]);

  const updateItem = useCallback((clientId: string, patch: Partial<EvidenceQueueItem>) => {
    if (!mounted.current) return;
    setItems((current) =>
      current.map((item) => (item.clientId === clientId ? { ...item, ...patch } : item)),
    );
  }, []);

  const processItem = useCallback(
    async (clientId: string, file: File) => {
      const isAllowedType = (ALLOWED_MIME_TYPES as readonly string[]).includes(file.type);
      if (!isAllowedType) {
        updateItem(clientId, {
          status: 'error',
          errorReason: 'unsupported_type',
          errorMessage: 'That file type is not supported. Use JPEG, PNG, WEBP, HEIC, MP4, MOV, or WEBM.',
        });
        return;
      }

      const kind = detectKind(file.type);
      updateItem(clientId, { status: 'compressing', kind });

      let uploadBlob: Blob = file;
      let mimeType = file.type as AllowedMimeType;

      if (kind === 'image') {
        try {
          const compressed = await compressImage(file);
          uploadBlob = compressed.blob;
          mimeType = compressed.mimeType as AllowedMimeType;
        } catch {
          uploadBlob = file;
          mimeType = file.type as AllowedMimeType;
        }
      }

      const sizeMb = uploadBlob.size / (1024 * 1024);
      if (sizeMb > MAX_UPLOAD_MB) {
        updateItem(clientId, {
          status: 'error',
          errorReason: 'too_large',
          errorMessage: `This file is ${sizeMb.toFixed(1)} MB, over the ${MAX_UPLOAD_MB} MB limit.`,
        });
        return;
      }

      updateItem(clientId, { status: 'uploading', progress: 0 });

      try {
        const { uploadUrl, key } = await presignEvidence({ escrowId, phase, mimeType });
        await uploadFileToPresignedUrl(uploadUrl, uploadBlob, mimeType, (fraction) => {
          updateItem(clientId, { progress: fraction });
        });
        const confirmed = await confirmEvidence({ escrowId, phase, key, declaredMime: mimeType });
        updateItem(clientId, { status: 'confirmed', progress: 1, confirmed, errorReason: undefined, errorMessage: undefined });
      } catch (error) {
        const message =
          error instanceof ApiError ? error.message : 'The upload failed. Please try again.';
        updateItem(clientId, { status: 'error', errorReason: 'upload_failed', errorMessage: message });
      }
    },
    [escrowId, phase, updateItem],
  );

  const addFiles = useCallback(
    (files: File[]) => {
      for (const file of files) {
        const clientId = nextClientId();
        const previewUrl = file.size > 0 ? URL.createObjectURL(file) : null;
        setItems((current) => [
          ...current,
          {
            clientId,
            sourceFile: file,
            kind: detectKind(file.type),
            previewUrl,
            status: 'compressing',
            progress: 0,
          },
        ]);
        void processItem(clientId, file);
      }
    },
    [processItem],
  );

  const retryItem = useCallback(
    (clientId: string) => {
      const item = items.find((current) => current.clientId === clientId);
      if (!item) return;
      void processItem(clientId, item.sourceFile);
    },
    [items, processItem],
  );

  const removeItem = useCallback((clientId: string) => {
    setItems((current) => {
      const target = current.find((item) => item.clientId === clientId);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return current.filter((item) => item.clientId !== clientId);
    });
  }, []);

  const confirmedCount = items.filter((item) => item.status === 'confirmed').length;

  return { items, addFiles, retryItem, removeItem, confirmedCount, maxUploadMb: MAX_UPLOAD_MB };
}

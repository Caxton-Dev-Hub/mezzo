'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, Upload } from 'lucide-react';
import type { EvidencePhase } from '@mezzo/shared-types';
import { useEvidenceQueue } from '../../hooks/use-evidence-queue';
import { CameraCapturePanel } from './camera-capture-panel';
import { EvidenceItemCard } from './evidence-item-card';
import { Button } from '../ui/button';

interface EvidenceCaptureProps {
  escrowId: string;
  phase: EvidencePhase;
  onConfirmedCountChange?: (count: number) => void;
}

export function EvidenceCapture({ escrowId, phase, onConfirmedCountChange }: EvidenceCaptureProps) {
  const { items, addFiles, retryItem, removeItem, confirmedCount, maxUploadMb } = useEvidenceQueue(
    escrowId,
    phase,
  );
  const [cameraOpen, setCameraOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    onConfirmedCountChange?.(confirmedCount);
  }, [confirmedCount, onConfirmedCountChange]);

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length > 0) {
      addFiles(files);
    }
    event.target.value = '';
  };

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="secondary"
          className="gap-2"
          onClick={() => setCameraOpen((open) => !open)}
        >
          <Camera className="h-4 w-4" />
          {cameraOpen ? 'Close camera' : 'Take photo'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="gap-2"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-4 w-4" />
          Add from library
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={handleFileInputChange}
        />
      </div>

      <p className="mt-2 text-[13px] text-mute">Photos and video up to {maxUploadMb} MB each.</p>

      {cameraOpen ? (
        <div className="mt-4">
          <CameraCapturePanel
            onCapture={(file) => addFiles([file])}
            onClose={() => setCameraOpen(false)}
          />
        </div>
      ) : null}

      {items.length > 0 ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {items.map((item) => (
            <EvidenceItemCard key={item.clientId} item={item} onRetry={retryItem} onRemove={removeItem} />
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-line px-4 py-10 text-center text-[13px] text-mute">
          No photos yet
        </div>
      )}
    </div>
  );
}

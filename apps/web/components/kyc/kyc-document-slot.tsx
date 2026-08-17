'use client';

import { useRef, useState } from 'react';
import { Camera, CheckCircle2, RotateCcw, TriangleAlert, Upload } from 'lucide-react';
import { CameraCapturePanel } from '../evidence/camera-capture-panel';
import { Button } from '../ui/button';
import type { KycDocumentSlot as KycDocumentSlotState } from '../../hooks/use-kyc-document-queue';

interface KycDocumentSlotProps {
  label: string;
  hint: string;
  slot: KycDocumentSlotState;
  onSelectFile: (file: File) => void;
}

export function KycDocumentSlot({ label, hint, slot, onSelectFile }: KycDocumentSlotProps) {
  const [cameraOpen, setCameraOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onSelectFile(file);
    }
    event.target.value = '';
  };

  return (
    <div className="rounded-xl border border-line-soft bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-vellum">{label}</p>
          <p className="mt-0.5 text-[13px] text-mute">{hint}</p>
        </div>
        {slot.status === 'confirmed' ? (
          <CheckCircle2 className="h-5 w-5 shrink-0 text-mint" />
        ) : null}
      </div>

      {slot.previewUrl ? (
        <div className="relative mt-3 aspect-[4/3] w-full overflow-hidden rounded-lg bg-surface-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={slot.previewUrl} alt="" className="h-full w-full object-cover" />
          {slot.status === 'uploading' ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-ink/70 text-center">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-vellum border-t-transparent" />
              <span className="text-[11px] text-vellum">{Math.round(slot.progress * 100)}%</span>
            </div>
          ) : null}
        </div>
      ) : null}

      {slot.status === 'error' ? (
        <p role="alert" className="mt-3 flex items-center gap-1.5 text-[13px] text-danger">
          <TriangleAlert className="h-4 w-4 shrink-0" />
          {slot.errorMessage}
        </p>
      ) : null}

      {cameraOpen ? (
        <div className="mt-3">
          <CameraCapturePanel
            onCapture={(file) => {
              setCameraOpen(false);
              onSelectFile(file);
            }}
            onClose={() => setCameraOpen(false)}
          />
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="gap-2"
            onClick={() => setCameraOpen(true)}
          >
            <Camera className="h-4 w-4" />
            Take photo
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="gap-2"
            onClick={() => fileInputRef.current?.click()}
          >
            {slot.status === 'error' ? (
              <RotateCcw className="h-4 w-4" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {slot.status === 'confirmed'
              ? 'Replace photo'
              : slot.status === 'error'
                ? 'Try again'
                : 'Add from library'}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileInputChange}
          />
        </div>
      )}
    </div>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { Button } from '../ui/button';

interface CameraCapturePanelProps {
  onCapture: (file: File) => void;
  onClose: () => void;
}

export function CameraCapturePanel({ onCapture, onClose }: CameraCapturePanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError('Camera unavailable — check permissions, or use "Add from library" instead.');
        }
      });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const handleCapture = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) {
          onCapture(new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' }));
        }
      },
      'image/jpeg',
      0.92,
    );
  };

  return (
    <div className="rounded-2xl border border-line-soft bg-surface p-3 sm:p-4">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-fog">Camera</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close camera"
          className="rounded-full p-1.5 text-fog hover:text-vellum"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-[13px] text-danger">
          {error}
        </p>
      ) : (
        <div className="mt-3 overflow-hidden rounded-xl bg-black">
          <video ref={videoRef} autoPlay playsInline muted className="aspect-[4/3] w-full object-cover" />
        </div>
      )}

      <div className="mt-3 flex justify-center">
        <Button type="button" onClick={handleCapture} disabled={Boolean(error)} className="gap-2">
          <Camera className="h-4 w-4" />
          Capture
        </Button>
      </div>
    </div>
  );
}

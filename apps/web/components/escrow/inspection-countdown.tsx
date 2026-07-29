'use client';

import { useEffect, useState } from 'react';

interface InspectionCountdownProps {
  deliveredAt: Date | string;
  inspectionWindowHours: number;
}

function formatRemaining(msRemaining: number): string {
  const totalMinutes = Math.max(0, Math.floor(msRemaining / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export function InspectionCountdown({ deliveredAt, inspectionWindowHours }: InspectionCountdownProps) {
  const deadline = new Date(deliveredAt).getTime() + inspectionWindowHours * 60 * 60 * 1000;
  const windowMs = inspectionWindowHours * 60 * 60 * 1000;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);

  const remainingMs = deadline - now;
  const expired = remainingMs <= 0;
  const isWarning = !expired && remainingMs <= windowMs * 0.1;

  return (
    <div
      role="status"
      className={`rounded-lg border px-3 py-2 text-sm ${
        expired
          ? 'border-line-soft bg-surface-2 text-mute'
          : isWarning
            ? 'border-danger/40 bg-danger/10 text-danger'
            : 'border-line-soft bg-surface-2 text-vellum'
      }`}
    >
      {expired ? (
        <span>Inspection window has ended. Funds will release automatically.</span>
      ) : (
        <span>
          {isWarning ? 'Inspection window ending soon: ' : 'Inspection window: '}
          {formatRemaining(remainingMs)} remaining
        </span>
      )}
    </div>
  );
}

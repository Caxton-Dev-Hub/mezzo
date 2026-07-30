'use client';

import { useEffect, useState } from 'react';
import { formatRemaining } from '../../lib/format-duration';

interface InspectionCountdownProps {
  deliveredAt: Date | string;
  inspectionWindowHours: number;
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

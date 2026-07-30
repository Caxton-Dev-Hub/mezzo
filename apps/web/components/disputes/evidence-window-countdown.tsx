'use client';

import { useEffect, useState } from 'react';
import { formatRemaining } from '../../lib/format-duration';
import { formatDateTime } from '../../lib/format-date';

interface EvidenceWindowCountdownProps {
  expiresAt: Date | string;
}

export function EvidenceWindowCountdown({ expiresAt }: EvidenceWindowCountdownProps) {
  const deadline = new Date(expiresAt).getTime();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);

  const remainingMs = deadline - now;
  const closed = remainingMs <= 0;

  return (
    <div
      role="status"
      className={`rounded-lg border px-3 py-2 text-sm ${
        closed ? 'border-line-soft bg-surface-2 text-mute' : 'border-line-soft bg-surface-2 text-vellum'
      }`}
    >
      {closed ? (
        <span>Evidence window closed on {formatDateTime(new Date(deadline))}.</span>
      ) : (
        <span>
          Evidence window:{' '}
          <span className="font-mono tabular">{formatRemaining(remainingMs)}</span> left to submit
        </span>
      )}
    </div>
  );
}

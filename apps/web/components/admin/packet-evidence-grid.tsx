'use client';

import type { EvidenceItemResponse } from '@mezzo/shared-types';
import { isImageMime } from '@mezzo/shared-types';
import { Film, ImageIcon, TriangleAlert } from 'lucide-react';
import { EVIDENCE_FLAG_LABELS } from '../../lib/evidence-flag-labels';
import { formatDateTime } from '../../lib/format-date';

interface PacketEvidenceGridProps {
  heading: string;
  items: EvidenceItemResponse[];
  emptyLabel: string;
}

export function PacketEvidenceGrid({ heading, items, emptyLabel }: PacketEvidenceGridProps) {
  return (
    <section aria-label={heading}>
      <h3 className="mb-3 text-sm font-medium text-vellum">{heading}</h3>
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-[13px] text-mute">
          {emptyLabel}
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li
              key={item.id}
              id={`evidence-${item.id}`}
              className="flex gap-3 rounded-xl border border-line-soft bg-surface p-3 target:border-mint"
            >
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                {item.url && isImageMime(item.declaredMime) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-mute">
                    {isImageMime(item.declaredMime) ? (
                      <ImageIcon className="h-5 w-5" />
                    ) : (
                      <Film className="h-5 w-5" />
                    )}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-[11px] text-mute">{item.id}</p>
                <p className="mt-1 text-[13px] text-fog">
                  Captured{' '}
                  {item.capturedAt ? formatDateTime(item.capturedAt) : 'unknown'} · uploaded{' '}
                  {formatDateTime(item.createdAt)}
                </p>
                <p className="mt-1 truncate font-mono text-[11px] text-mute">
                  sha256 {item.contentHash}
                </p>
                {item.flags.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {item.flags.map((flag) => (
                      <li
                        key={flag}
                        className="flex items-center gap-1.5 rounded-md border border-seller/30 bg-seller/10 px-2 py-1 text-[12px] text-seller"
                      >
                        <TriangleAlert className="h-3 w-3 shrink-0" />
                        {EVIDENCE_FLAG_LABELS[flag] ?? flag}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

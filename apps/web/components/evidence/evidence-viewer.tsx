'use client';

import { useState } from 'react';
import { Film, ImageIcon, TriangleAlert } from 'lucide-react';
import type { EvidenceItemResponse } from '@mezzo/shared-types';
import { isImageMime } from '@mezzo/shared-types';
import { Modal } from '../ui/modal';

const FLAG_LABELS: Record<string, string> = {
  DUPLICATE_CONTENT: 'Duplicate content',
  MISSING_METADATA: 'Missing capture metadata',
  TIMESTAMP_MISMATCH: 'Capture timestamp mismatch',
};

interface EvidenceViewerProps {
  items: EvidenceItemResponse[];
  emptyLabel?: string;
}

export function EvidenceViewer({ items, emptyLabel = 'No evidence submitted' }: EvidenceViewerProps) {
  const [openItem, setOpenItem] = useState<EvidenceItemResponse | null>(null);

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-[13px] text-mute">
        {emptyLabel}
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {items.map((item) => {
          const isImage = isImageMime(item.declaredMime);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setOpenItem(item)}
              className="relative aspect-square overflow-hidden rounded-xl border border-line-soft bg-surface-2 text-left"
            >
              {item.url && isImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-mute">
                  {isImage ? <ImageIcon className="h-6 w-6" /> : <Film className="h-6 w-6" />}
                </div>
              )}
              {item.flags.length > 0 ? (
                <span
                  title={item.flags.map((flag) => FLAG_LABELS[flag] ?? flag).join(', ')}
                  className="absolute left-1.5 top-1.5 rounded-full bg-ink/80 p-1 text-seller"
                >
                  <TriangleAlert className="h-3 w-3" />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <Modal open={openItem !== null} onClose={() => setOpenItem(null)} title="Evidence" className="max-w-2xl">
        {openItem ? (
          <div>
            {openItem.url && isImageMime(openItem.declaredMime) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={openItem.url} alt="" className="max-h-[60vh] w-full rounded-lg object-contain" />
            ) : openItem.url ? (
              <video src={openItem.url} controls className="max-h-[60vh] w-full rounded-lg" />
            ) : null}

            {openItem.flags.length > 0 ? (
              <div className="mt-4 space-y-1.5 rounded-lg border border-seller/30 bg-seller/10 p-3">
                {openItem.flags.map((flag) => (
                  <p key={flag} className="flex items-center gap-1.5 text-[13px] text-seller">
                    <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
                    {FLAG_LABELS[flag] ?? flag}
                  </p>
                ))}
              </div>
            ) : null}

            <dl className="mt-4 space-y-2 text-[13px]">
              <div className="flex justify-between gap-4">
                <dt className="text-fog">Captured</dt>
                <dd className="text-vellum">
                  {openItem.capturedAt ? new Date(openItem.capturedAt).toLocaleString() : 'Unknown'}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-fog">Device</dt>
                <dd className="text-vellum">
                  {openItem.deviceMake || openItem.deviceModel
                    ? [openItem.deviceMake, openItem.deviceModel].filter(Boolean).join(' ')
                    : 'Unknown'}
                </dd>
              </div>
            </dl>
          </div>
        ) : null}
      </Modal>
    </>
  );
}

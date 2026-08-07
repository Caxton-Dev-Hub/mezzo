import { Film, ImageIcon, RotateCcw, TriangleAlert, X } from 'lucide-react';
import type { EvidenceQueueItem } from '../../hooks/use-evidence-queue';
import { cn } from '../../lib/utils';

interface EvidenceItemCardProps {
  item: EvidenceQueueItem;
  onRetry: (clientId: string) => void;
  onRemove: (clientId: string) => void;
}

export function EvidenceItemCard({ item, onRetry, onRemove }: EvidenceItemCardProps) {
  const canRemove = item.status === 'error' || item.status === 'compressing';
  const flags = item.confirmed?.flags ?? [];

  return (
    <div className="relative aspect-square overflow-hidden rounded-xl border border-line-soft bg-surface shadow-card">
      {item.previewUrl ? (
        item.kind === 'image' ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <video src={item.previewUrl} className="h-full w-full object-cover" muted />
        )
      ) : (
        <div className="flex h-full w-full items-center justify-center text-mute">
          {item.kind === 'image' ? <ImageIcon className="h-6 w-6" /> : <Film className="h-6 w-6" />}
        </div>
      )}

      {item.status === 'compressing' || item.status === 'uploading' ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-ink/70 text-center">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-vellum border-t-transparent" />
          <span className="text-[11px] text-vellum">
            {item.status === 'compressing' ? 'Preparing…' : `${Math.round(item.progress * 100)}%`}
          </span>
        </div>
      ) : null}

      {item.status === 'error' ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-ink/85 p-2 text-center">
          <TriangleAlert className="h-4 w-4 text-danger" />
          <span className="text-[11px] leading-snug text-danger">{item.errorMessage}</span>
          {item.errorReason === 'upload_failed' ? (
            <button
              type="button"
              onClick={() => onRetry(item.clientId)}
              className="mt-1 inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-[11px] text-vellum hover:border-fog"
            >
              <RotateCcw className="h-3 w-3" />
              Retry
            </button>
          ) : null}
        </div>
      ) : null}

      {flags.length > 0 ? (
        <div
          title={flags.join(', ')}
          className="absolute left-1.5 top-1.5 rounded-full bg-ink/80 p-1 text-seller"
        >
          <TriangleAlert className="h-3 w-3" />
        </div>
      ) : null}

      {canRemove ? (
        <button
          type="button"
          onClick={() => onRemove(item.clientId)}
          aria-label="Remove"
          className={cn(
            'absolute right-1.5 top-1.5 rounded-full bg-ink/80 p-1 text-vellum hover:bg-ink',
          )}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

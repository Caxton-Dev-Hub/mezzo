import type { DisputeTimelineEntry } from '@mezzo/shared-types';
import { formatDateTime } from '../../lib/format-date';

interface PacketTimelineProps {
  entries: DisputeTimelineEntry[];
}

export function PacketTimeline({ entries }: PacketTimelineProps) {
  if (entries.length === 0) {
    return <p className="text-[13px] text-mute">No events recorded.</p>;
  }

  return (
    <ol className="space-y-2">
      {entries.map((entry) => (
        <li
          key={`${entry.source}-${entry.createdAt}-${entry.toState}`}
          className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-l border-line pl-3"
        >
          <span className="font-mono text-[11px] uppercase tracking-wide text-mute">
            {entry.source}
          </span>
          <span className="font-mono text-[12px] text-vellum">
            {entry.fromState} → {entry.toState}
          </span>
          <span className="text-[12px] text-mute">{formatDateTime(entry.createdAt)}</span>
          {entry.reason ? <span className="text-[12px] text-fog">{entry.reason}</span> : null}
        </li>
      ))}
    </ol>
  );
}

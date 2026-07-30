import type { ArbitrationRecordResponse } from '@mezzo/shared-types';
import { Bot, TriangleAlert } from 'lucide-react';
import { DISPUTE_OUTCOME_LABELS } from '../../lib/dispute-labels';

interface ArbitrationBadgeProps {
  record: ArbitrationRecordResponse | null;
}

export function ArbitrationBadge({ record }: ArbitrationBadgeProps) {
  if (!record) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[11px] text-mute">
        No AI analysis yet
      </span>
    );
  }

  if (record.status === 'NEEDS_HUMAN') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-seller/40 bg-seller/10 px-2.5 py-1 text-[11px] text-seller">
        <TriangleAlert className="h-3 w-3" />
        Needs human
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-mint/30 bg-mint/10 px-2.5 py-1 text-[11px] text-mint">
      <Bot className="h-3 w-3" />
      {record.recommendedOutcome ? DISPUTE_OUTCOME_LABELS[record.recommendedOutcome] : 'Recommended'}
      <span className="font-mono tabular">{Math.round(record.confidence * 100)}%</span>
    </span>
  );
}

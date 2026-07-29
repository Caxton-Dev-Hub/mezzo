import type { EscrowEventResponse, EscrowState } from '@mezzo/shared-types';
import { Check, TriangleAlert } from 'lucide-react';
import { formatDateTime } from '../../lib/format-date';
import { ESCROW_BRANCH_STATES, ESCROW_STATE_LABELS } from '../../lib/escrow-state-labels';
import { cn } from '../../lib/utils';

interface TimelineStep {
  state: EscrowState;
  timestamp: Date;
  isBranch: boolean;
}

interface StatusTimelineProps {
  currentState: EscrowState;
  createdAt: Date | string;
  events: EscrowEventResponse[];
}

export function StatusTimeline({ currentState, createdAt, events }: StatusTimelineProps) {
  const steps: TimelineStep[] = [
    { state: 'DRAFT' as EscrowState, timestamp: new Date(createdAt), isBranch: false },
    ...events.map((event) => ({
      state: event.toState,
      timestamp: new Date(event.createdAt),
      isBranch: ESCROW_BRANCH_STATES.has(event.toState),
    })),
  ];

  return (
    <ol className="relative space-y-0">
      {steps.map((step, index) => {
        const isCurrent = step.state === currentState;
        const isLast = index === steps.length - 1;

        return (
          <li key={`${step.state}-${index}`} className="relative flex gap-3 pb-6 last:pb-0">
            {!isLast ? (
              <span
                aria-hidden
                className="absolute left-[11px] top-6 h-full w-px bg-line"
              />
            ) : null}
            <span
              aria-hidden
              className={cn(
                'relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border',
                isCurrent
                  ? step.isBranch
                    ? 'border-danger bg-danger/15 text-danger'
                    : 'border-mint bg-mint/15 text-mint'
                  : 'border-line bg-surface text-mute',
              )}
            >
              {isCurrent ? (
                step.isBranch ? (
                  <TriangleAlert className="h-3.5 w-3.5" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
            </span>
            <div className="flex-1 pt-0.5" aria-current={isCurrent ? 'step' : undefined}>
              <p className={cn('text-sm font-medium', isCurrent ? 'text-vellum' : 'text-fog')}>
                {ESCROW_STATE_LABELS[step.state]}
              </p>
              <time dateTime={step.timestamp.toISOString()} className="text-[13px] text-mute">
                {formatDateTime(step.timestamp)}
              </time>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

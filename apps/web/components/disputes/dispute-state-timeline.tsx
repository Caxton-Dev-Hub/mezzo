import type { DisputeState } from '@mezzo/shared-types';
import { Check, Circle } from 'lucide-react';
import { DISPUTE_STATE_LABELS, DISPUTE_STATE_ORDER } from '../../lib/dispute-labels';
import { cn } from '../../lib/utils';

interface DisputeStateTimelineProps {
  currentState: DisputeState;
}

export function DisputeStateTimeline({ currentState }: DisputeStateTimelineProps) {
  const currentIndex = DISPUTE_STATE_ORDER.indexOf(currentState);

  return (
    <ol className="flex flex-col gap-3 sm:flex-row sm:items-center">
      {DISPUTE_STATE_ORDER.map((state, index) => {
        const isCurrent = index === currentIndex;
        const isPast = index < currentIndex;

        return (
          <li key={state} className="flex flex-1 items-center gap-2">
            <span
              aria-hidden
              className={cn(
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                isCurrent
                  ? 'border-danger bg-danger/15 text-danger'
                  : isPast
                    ? 'border-line bg-surface text-mute'
                    : 'border-line-soft bg-surface text-mute',
              )}
            >
              {isPast || isCurrent ? (
                <Check className="h-3 w-3" />
              ) : (
                <Circle className="h-2 w-2" />
              )}
            </span>
            <span
              aria-current={isCurrent ? 'step' : undefined}
              className={cn(
                'font-mono text-[12px] uppercase tracking-wide',
                isCurrent ? 'text-vellum' : 'text-mute',
              )}
            >
              {DISPUTE_STATE_LABELS[state]}
            </span>
            {index < DISPUTE_STATE_ORDER.length - 1 ? (
              <span aria-hidden className="hidden h-px flex-1 bg-line sm:block" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

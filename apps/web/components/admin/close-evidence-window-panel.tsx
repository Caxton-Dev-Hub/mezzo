'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { closeDisputeEvidenceWindow } from '../../lib/dispute-client';
import { formatDateTime } from '../../lib/format-date';
import { ApiError } from '../../lib/api-error';
import { Button } from '../ui/button';

interface CloseEvidenceWindowPanelProps {
  disputeId: string;
  expiresAt: Date | string;
  elapsed: boolean;
}

export function CloseEvidenceWindowPanel({
  disputeId,
  expiresAt,
  elapsed,
}: CloseEvidenceWindowPanelProps) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => closeDisputeEvidenceWindow(disputeId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-dispute', disputeId] });
      void queryClient.invalidateQueries({ queryKey: ['admin-disputes'] });
    },
  });

  return (
    <section
      aria-label="Close evidence window"
      className="rounded-xl border border-line-soft bg-surface shadow-card p-4"
    >
      <h2 className="text-sm font-medium text-vellum">Evidence window is still open</h2>
      <p className="mt-1 text-[13px] text-fog">
        {elapsed
          ? 'The window has run out but the dispute has not moved to review yet.'
          : `Both parties can still submit until ${formatDateTime(expiresAt)}.`}{' '}
        A dispute can only be resolved once the window is closed.
      </p>
      <Button
        type="button"
        variant="secondary"
        className="mt-3 w-full"
        loading={mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        Close evidence window
      </Button>
      {mutation.error ? (
        <p role="alert" className="mt-3 text-[13px] text-danger">
          {mutation.error instanceof ApiError
            ? mutation.error.message
            : 'Could not close the evidence window.'}
        </p>
      ) : null}
    </section>
  );
}

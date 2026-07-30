'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import type { EscrowDetailResponse } from '@mezzo/shared-types';
import { cancelEscrow } from '../../lib/escrow-client';
import { useEscrowWizardStore } from '../../lib/escrow-wizard-store';
import { formatMoney } from '../../lib/money';
import { formatDateTime } from '../../lib/format-date';
import { ApiError } from '../../lib/api-error';
import { Button } from '../ui/button';
import { ConfirmModal } from '../ui/confirm-modal';

export function DraftList({ drafts }: { drafts: EscrowDetailResponse[] }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const setEscrow = useEscrowWizardStore((state) => state.setEscrow);
  const setStep = useEscrowWizardStore((state) => state.setStep);
  const resetWizard = useEscrowWizardStore((state) => state.reset);
  const wizardEscrowId = useEscrowWizardStore((state) => state.escrow?.id);
  const [pendingDelete, setPendingDelete] = useState<EscrowDetailResponse | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (escrowId: string) => cancelEscrow(escrowId),
    onSuccess: (_escrow, escrowId) => {
      if (wizardEscrowId === escrowId) {
        resetWizard();
      }
      queryClient.invalidateQueries({ queryKey: ['escrows'] });
      setPendingDelete(null);
    },
  });

  const resume = (draft: EscrowDetailResponse) => {
    setEscrow(draft);
    setStep(1);
    router.push('/escrow/new');
  };

  return (
    <section>
      <h2 className="mb-3 text-sm font-medium text-vellum">Drafts</h2>
      <ul className="divide-y divide-line-soft rounded-xl border border-dashed border-line bg-surface">
        {drafts.map((draft) => (
          <li key={draft.id} className="flex items-center gap-3 px-4 py-3.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-vellum">
                {draft.terms?.itemDescription ?? 'Untitled escrow'}
              </p>
              <p className="mt-0.5 text-[13px] text-mute">
                Not sent yet · {formatDateTime(draft.updatedAt)}
                {draft.terms
                  ? ` · ${formatMoney(draft.terms.price.amount, draft.terms.price.currency)}`
                  : ''}
              </p>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={() => resume(draft)}>
              Resume
            </Button>
            <button
              type="button"
              aria-label={`Delete draft ${draft.terms?.itemDescription ?? draft.id}`}
              onClick={() => setPendingDelete(draft)}
              className="shrink-0 text-mute hover:text-danger"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>

      <ConfirmModal
        open={pendingDelete !== null}
        title="Delete this draft?"
        description="The draft and the photos on it are discarded. Nothing has been sent to a counterparty, and this cannot be undone."
        confirmLabel="Delete draft"
        destructive
        loading={deleteMutation.isPending}
        error={
          deleteMutation.error
            ? deleteMutation.error instanceof ApiError
              ? deleteMutation.error.message
              : 'Could not delete the draft. Please try again.'
            : null
        }
        onConfirm={() => {
          if (pendingDelete) {
            deleteMutation.mutate(pendingDelete.id);
          }
        }}
        onClose={() => setPendingDelete(null)}
      />
    </section>
  );
}

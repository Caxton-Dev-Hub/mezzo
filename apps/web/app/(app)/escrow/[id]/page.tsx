'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import { useAuthStore } from '../../../../lib/auth-store';
import { getEscrow, getEscrowEvents } from '../../../../lib/escrow-client';
import { listEscrowDisputes } from '../../../../lib/dispute-client';
import { getEvidenceBundle } from '../../../../lib/evidence-client';
import { ApiError } from '../../../../lib/api-error';
import { ESCROW_STATE_LABELS } from '../../../../lib/escrow-state-labels';
import { DISPUTE_REASON_LABELS, DISPUTE_STATE_LABELS } from '../../../../lib/dispute-labels';
import { StatusTimeline } from '../../../../components/escrow/status-timeline';
import { TermsPanel } from '../../../../components/escrow/terms-panel';
import { ActionBar } from '../../../../components/escrow/action-bar';
import { EvidenceViewer } from '../../../../components/evidence/evidence-viewer';
import { InspectionCountdown } from '../../../../components/escrow/inspection-countdown';
import { ChatPanel } from '../../../../components/chat/chat-panel';
import { CounterpartyCard } from '../../../../components/profile/counterparty-card';
import { useChatSocket } from '../../../../hooks/use-chat-socket';

const NON_EDITABLE_STATES = new Set(['DRAFT', 'PENDING_COUNTERPARTY']);

const RECEIPT_ELIGIBLE_STATES = new Set([
  'FUNDED',
  'SHIPPED',
  'DELIVERED',
  'RELEASED',
  'DISPUTED',
  'RESOLVED_RELEASE',
  'RESOLVED_REFUND',
  'REFUNDED',
]);

const DISPUTE_LINK_STATES = new Set([
  'DISPUTED',
  'RESOLVED_RELEASE',
  'RESOLVED_REFUND',
  'RELEASED',
  'REFUNDED',
]);

export default function EscrowDetailPage() {
  const params = useParams<{ id: string }>();
  const escrowId = params.id;
  const sessionStatus = useAuthStore((state) => state.status);
  const currentUserId = useAuthStore((state) => state.user?.id);
  const queryClient = useQueryClient();

  useChatSocket(escrowId, {
    onEscrowUpdated: () => {
      void queryClient.invalidateQueries({ queryKey: ['escrow', escrowId] });
      void queryClient.invalidateQueries({ queryKey: ['escrow-events', escrowId] });
    },
  });

  const escrowQuery = useQuery({
    queryKey: ['escrow', escrowId],
    queryFn: () => getEscrow(escrowId),
    enabled: sessionStatus === 'authenticated',
  });

  const eventsQuery = useQuery({
    queryKey: ['escrow-events', escrowId],
    queryFn: () => getEscrowEvents(escrowId),
    enabled: escrowQuery.isSuccess,
  });

  const evidenceQuery = useQuery({
    queryKey: ['evidence', escrowId],
    queryFn: () => getEvidenceBundle(escrowId),
    enabled: escrowQuery.isSuccess,
  });

  const disputesQuery = useQuery({
    queryKey: ['escrow-disputes', escrowId],
    queryFn: () => listEscrowDisputes(escrowId),
    enabled: escrowQuery.data !== undefined && DISPUTE_LINK_STATES.has(escrowQuery.data.state),
  });

  if (sessionStatus === 'pending' || escrowQuery.isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-2/3 animate-pulse rounded bg-surface-2" />
        <div className="h-40 animate-pulse rounded-xl bg-surface-2" />
        <div className="h-40 animate-pulse rounded-xl bg-surface-2" />
      </div>
    );
  }

  if (escrowQuery.isError) {
    const message =
      escrowQuery.error instanceof ApiError
        ? escrowQuery.error.message
        : 'Could not load this escrow.';
    return (
      <div className="flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-16 text-center">
        <ShieldAlert className="h-6 w-6 text-mute" />
        <p className="mt-3 text-sm text-vellum">{message}</p>
      </div>
    );
  }

  const escrow = escrowQuery.data;
  if (!escrow) {
    return null;
  }
  const termsFrozen = !NON_EDITABLE_STATES.has(escrow.state);
  const creationEvidence =
    evidenceQuery.data?.items.filter((item) => item.phase === 'AT_CREATION') ?? [];
  const dispute = disputesQuery.data?.[0];
  const counterparty = escrow.parties.find((party) => party.userId !== currentUserId);

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-[1.75rem] leading-tight text-vellum sm:text-[2rem]">
            {escrow.terms?.itemDescription ?? 'Escrow'}
          </h1>
          <p className="mt-1 text-sm text-fog">{ESCROW_STATE_LABELS[escrow.state]}</p>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <section className="rounded-xl border border-line-soft bg-surface p-4">
            <h2 className="text-sm font-medium text-vellum">Status</h2>
            <div className="mt-4">
              <StatusTimeline
                currentState={escrow.state}
                createdAt={escrow.createdAt}
                events={eventsQuery.data ?? []}
              />
            </div>
            {escrow.state === 'DELIVERED' && escrow.deliveredAt && escrow.terms ? (
              <div className="mt-4">
                <InspectionCountdown
                  deliveredAt={escrow.deliveredAt}
                  inspectionWindowHours={escrow.terms.inspectionWindowHours}
                />
              </div>
            ) : null}
          </section>

          <section>
            <h2 className="mb-3 text-sm font-medium text-vellum">Evidence at creation</h2>
            {evidenceQuery.isLoading ? (
              <div className="h-32 animate-pulse rounded-xl bg-surface-2" />
            ) : (
              <EvidenceViewer items={creationEvidence} emptyLabel="No creation evidence on file" />
            )}
          </section>

          <section>
            <h2 className="mb-3 text-sm font-medium text-vellum">Chat</h2>
            <ChatPanel escrow={escrow} />
          </section>
        </div>

        <div className="space-y-6">
          {counterparty ? (
            <CounterpartyCard
              userId={counterparty.userId}
              roleLabel={counterparty.role === 'SELLER' ? 'Seller' : 'Buyer'}
            />
          ) : null}
          {dispute ? (
            <div className="rounded-xl border border-danger/30 bg-danger/5 p-4">
              <h2 className="text-sm font-medium text-vellum">Dispute</h2>
              <p className="mt-1 text-[13px] text-fog">
                {DISPUTE_STATE_LABELS[dispute.state]} ·{' '}
                {DISPUTE_REASON_LABELS[dispute.reasonCode]}
              </p>
              <Link
                href={`/disputes/${dispute.id}`}
                className="mt-3 inline-flex text-[13px] text-danger hover:underline"
              >
                Open the dispute center
              </Link>
            </div>
          ) : null}
          {escrow.terms ? <TermsPanel terms={escrow.terms} frozen={termsFrozen} /> : null}
          {RECEIPT_ELIGIBLE_STATES.has(escrow.state) ? (
            <Link
              href={`/escrow/${escrow.id}/receipt`}
              className="block rounded-xl border border-line-soft bg-surface p-4 text-sm text-vellum hover:border-line"
            >
              View receipt
            </Link>
          ) : null}
          {currentUserId ? (
            <div className="rounded-xl border border-line-soft bg-surface p-4">
              <h2 className="mb-3 text-sm font-medium text-vellum">Actions</h2>
              <ActionBar escrow={escrow} currentUserId={currentUserId} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

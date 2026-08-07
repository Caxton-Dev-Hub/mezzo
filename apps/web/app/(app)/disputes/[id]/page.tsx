'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { useAuthStore } from '../../../../lib/auth-store';
import { getDisputePacket } from '../../../../lib/dispute-client';
import { getEscrow } from '../../../../lib/escrow-client';
import { ApiError } from '../../../../lib/api-error';
import { DISPUTE_REASON_LABELS, DISPUTE_STATE_LABELS } from '../../../../lib/dispute-labels';
import { formatDateTime } from '../../../../lib/format-date';
import { TermsPanel } from '../../../../components/escrow/terms-panel';
import { EvidenceViewer } from '../../../../components/evidence/evidence-viewer';
import { DisputeStateTimeline } from '../../../../components/disputes/dispute-state-timeline';
import { EvidenceWindowCountdown } from '../../../../components/disputes/evidence-window-countdown';
import { DisputeEvidenceColumns } from '../../../../components/disputes/dispute-evidence-columns';
import { DisputeOutcomePanel } from '../../../../components/disputes/dispute-outcome-panel';
import { SellerRebuttalPanel } from '../../../../components/disputes/seller-rebuttal-panel';

export default function DisputeDetailPage() {
  const params = useParams<{ id: string }>();
  const disputeId = params.id;
  const sessionStatus = useAuthStore((state) => state.status);
  const currentUserId = useAuthStore((state) => state.user?.id);
  const accountRole = useAuthStore((state) => state.user?.role);

  const packetQuery = useQuery({
    queryKey: ['dispute', disputeId],
    queryFn: () => getDisputePacket(disputeId),
    enabled: sessionStatus === 'authenticated',
  });

  const escrowId = packetQuery.data?.dispute.escrowId;
  const escrowQuery = useQuery({
    queryKey: ['escrow', escrowId],
    queryFn: () => getEscrow(escrowId as string),
    enabled: escrowId !== undefined,
  });

  if (sessionStatus === 'pending' || packetQuery.isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-2/3 animate-pulse rounded bg-surface-2" />
        <div className="h-40 animate-pulse rounded-xl bg-surface-2" />
        <div className="h-40 animate-pulse rounded-xl bg-surface-2" />
      </div>
    );
  }

  if (packetQuery.isError) {
    const message =
      packetQuery.error instanceof ApiError
        ? packetQuery.error.message
        : 'Could not load this dispute.';
    return (
      <div className="flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-16 text-center">
        <ShieldAlert className="h-6 w-6 text-mute" />
        <p className="mt-3 text-sm text-vellum">{message}</p>
      </div>
    );
  }

  const packet = packetQuery.data;
  if (!packet) {
    return null;
  }

  const { dispute, frozenTerms, submissionFlags } = packet;
  const viewerRole =
    escrowQuery.data?.parties.find((party) => party.userId === currentUserId)?.role ?? null;
  const isArbiter = accountRole === 'ARBITER' || accountRole === 'ADMIN';
  const windowOpen = dispute.state === 'EVIDENCE' && !submissionFlags.evidenceWindowElapsed;
  const isResolved = dispute.state === 'RESOLVED';

  return (
    <div>
      <Link
        href={`/escrow/${dispute.escrowId}`}
        className="inline-flex items-center gap-1.5 text-[13px] text-fog hover:text-vellum"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to the escrow
      </Link>

      <div className="mt-4">
        <h1 className="font-display text-[1.75rem] leading-tight text-vellum sm:text-[2rem]">
          {frozenTerms.itemDescription}
        </h1>
        <p className="mt-1 text-sm text-fog">
          {DISPUTE_REASON_LABELS[dispute.reasonCode]} · {DISPUTE_STATE_LABELS[dispute.state]}
        </p>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <section className="rounded-xl border border-line-soft bg-surface shadow-card p-4">
            <h2 className="text-sm font-medium text-vellum">Dispute status</h2>
            <div className="mt-4">
              <DisputeStateTimeline currentState={dispute.state} />
            </div>
            {!isResolved ? (
              <div className="mt-4">
                <EvidenceWindowCountdown expiresAt={dispute.evidenceWindowExpiresAt} />
              </div>
            ) : null}
          </section>

          {isResolved ? <DisputeOutcomePanel dispute={dispute} viewerRole={viewerRole} /> : null}

          <section className="rounded-xl border border-line-soft bg-surface shadow-card p-4">
            <h2 className="text-sm font-medium text-vellum">What the buyer reported</h2>
            <p className="mt-1 text-[13px] text-mute">
              Raised {formatDateTime(dispute.createdAt)}
            </p>
            <p className="mt-3 whitespace-pre-wrap text-sm text-vellum">{dispute.statement}</p>
          </section>

          {viewerRole === 'SELLER' && windowOpen ? (
            <SellerRebuttalPanel escrowId={dispute.escrowId} disputeId={dispute.id} />
          ) : null}

          <section>
            <h2 className="mb-3 text-sm font-medium text-vellum">Evidence</h2>
            <DisputeEvidenceColumns
              packet={packet}
              viewerRole={viewerRole}
              isArbiter={isArbiter}
            />
          </section>

          <section>
            <h2 className="mb-3 text-sm font-medium text-vellum">Evidence at creation</h2>
            <EvidenceViewer
              items={packet.creationEvidence}
              emptyLabel="No creation evidence on file"
            />
          </section>
        </div>

        <div className="space-y-6">
          <TermsPanel terms={frozenTerms} frozen />
          <div className="rounded-xl border border-line-soft bg-surface shadow-card p-4">
            <h2 className="text-sm font-medium text-vellum">While this is open</h2>
            <p className="mt-2 text-[13px] text-fog">
              The escrow is frozen: nothing is released or refunded until an arbiter decides. You can
              keep talking to the other party in the escrow chat.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

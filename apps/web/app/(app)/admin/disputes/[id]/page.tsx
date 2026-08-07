'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { useAuthStore } from '../../../../../lib/auth-store';
import { getAdminDisputePacket, requestArbitrationRecommendation } from '../../../../../lib/admin-client';
import { getEscrow } from '../../../../../lib/escrow-client';
import { ApiError } from '../../../../../lib/api-error';
import {
  DISPUTE_OUTCOME_LABELS,
  DISPUTE_REASON_LABELS,
  DISPUTE_STATE_LABELS,
} from '../../../../../lib/dispute-labels';
import { formatDateTime } from '../../../../../lib/format-date';
import { formatMoney } from '../../../../../lib/money';
import { TermsPanel } from '../../../../../components/escrow/terms-panel';
import { ArbitrationPanel } from '../../../../../components/admin/arbitration-panel';
import { ResolutionForm } from '../../../../../components/admin/resolution-form';
import { CloseEvidenceWindowPanel } from '../../../../../components/admin/close-evidence-window-panel';
import { PacketEvidenceGrid } from '../../../../../components/admin/packet-evidence-grid';
import { PacketTimeline } from '../../../../../components/admin/packet-timeline';
import { PacketChatTranscript } from '../../../../../components/admin/packet-chat-transcript';
import { AuditTrail } from '../../../../../components/admin/audit-trail';

export default function AdminDisputePage() {
  const params = useParams<{ id: string }>();
  const disputeId = params.id;
  const queryClient = useQueryClient();
  const sessionStatus = useAuthStore((state) => state.status);
  const accountRole = useAuthStore((state) => state.user?.role);

  const packetQuery = useQuery({
    queryKey: ['admin-dispute', disputeId],
    queryFn: () => getAdminDisputePacket(disputeId),
    enabled: sessionStatus === 'authenticated',
  });

  const escrowId = packetQuery.data?.packet.dispute.escrowId;
  const escrowQuery = useQuery({
    queryKey: ['escrow', escrowId],
    queryFn: () => getEscrow(escrowId as string),
    enabled: escrowId !== undefined,
  });

  const analysisMutation = useMutation({
    mutationFn: () => requestArbitrationRecommendation(disputeId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-dispute', disputeId] });
    },
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
    return (
      <div className="flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-16 text-center">
        <ShieldAlert className="h-6 w-6 text-mute" />
        <p className="mt-3 text-sm text-vellum">
          {packetQuery.error instanceof ApiError
            ? packetQuery.error.message
            : 'Could not load this dispute.'}
        </p>
      </div>
    );
  }

  const data = packetQuery.data;
  if (!data) {
    return null;
  }

  const { packet, arbitrationRecords } = data;
  const { dispute, frozenTerms } = packet;
  const latestRecord = arbitrationRecords[0] ?? null;
  const buyerId = escrowQuery.data?.parties.find((party) => party.role === 'BUYER')?.userId ?? null;
  const isResolved = dispute.state === 'RESOLVED';

  return (
    <div>
      <Link
        href="/admin"
        className="inline-flex items-center gap-1.5 text-[13px] text-fog hover:text-vellum"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to the queue
      </Link>

      <div className="mt-4">
        <h1 className="font-display text-[1.75rem] leading-tight text-vellum sm:text-[2rem]">
          {frozenTerms.itemDescription}
        </h1>
        <p className="mt-1 text-sm text-fog">
          {DISPUTE_REASON_LABELS[dispute.reasonCode]} · {DISPUTE_STATE_LABELS[dispute.state]} ·
          raised {formatDateTime(dispute.createdAt)}
        </p>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <section className="rounded-xl border border-line-soft bg-surface shadow-card p-4">
            <h2 className="text-sm font-medium text-vellum">The buyer&apos;s claim</h2>
            <p className="mt-3 whitespace-pre-wrap text-sm text-vellum">{dispute.statement}</p>
          </section>

          <section className="rounded-xl border border-line-soft bg-surface shadow-card p-4">
            <h2 className="text-sm font-medium text-vellum">Event timeline</h2>
            <div className="mt-3">
              <PacketTimeline entries={packet.timeline} />
            </div>
          </section>

          <div className="space-y-6">
            <PacketEvidenceGrid
              heading="Buyer's evidence"
              items={packet.buyerEvidence}
              emptyLabel="No evidence submitted"
            />
            <PacketEvidenceGrid
              heading="Seller's evidence"
              items={packet.sellerEvidence}
              emptyLabel="No evidence submitted"
            />
            <PacketEvidenceGrid
              heading="Evidence at creation"
              items={packet.creationEvidence}
              emptyLabel="No creation evidence on file"
            />
          </div>

          <section className="rounded-xl border border-line-soft bg-surface shadow-card p-4">
            <h2 className="text-sm font-medium text-vellum">Chat transcript</h2>
            <div className="mt-3">
              <PacketChatTranscript messages={packet.chatTranscript} buyerId={buyerId} />
            </div>
          </section>

          <ArbitrationPanel
            record={latestRecord}
            onRequestAnalysis={() => analysisMutation.mutate()}
            requesting={analysisMutation.isPending}
            requestError={
              analysisMutation.error instanceof ApiError
                ? analysisMutation.error.message
                : analysisMutation.error
                  ? 'Could not run the analysis.'
                  : null
            }
          />
        </div>

        <div className="space-y-6">
          <TermsPanel terms={frozenTerms} frozen />

          {isResolved ? (
            <section
              aria-label="Executed resolution"
              className="rounded-xl border border-line-soft bg-surface shadow-card p-4"
            >
              <h2 className="text-sm font-medium text-vellum">Executed resolution</h2>
              <dl className="mt-3 space-y-2 text-[13px]">
                <div className="flex justify-between gap-4">
                  <dt className="text-fog">Outcome</dt>
                  <dd className="text-vellum">
                    {dispute.resolvedOutcome
                      ? DISPUTE_OUTCOME_LABELS[dispute.resolvedOutcome]
                      : 'Unknown'}
                  </dd>
                </div>
                {dispute.resolvedCurrency ? (
                  <>
                    <div className="flex justify-between gap-4">
                      <dt className="text-fog">To the seller</dt>
                      <dd className="font-mono tabular text-vellum">
                        {formatMoney(dispute.resolvedSellerAmount ?? 0, dispute.resolvedCurrency)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-fog">Refunded to the buyer</dt>
                      <dd className="font-mono tabular text-vellum">
                        {formatMoney(dispute.resolvedBuyerAmount ?? 0, dispute.resolvedCurrency)}
                      </dd>
                    </div>
                  </>
                ) : null}
                <div className="flex justify-between gap-4">
                  <dt className="text-fog">Arbitration record</dt>
                  <dd className="font-mono text-[11px] text-vellum">
                    {dispute.resolvedArbitrationRecordId ?? 'none'}
                  </dd>
                </div>
              </dl>
            </section>
          ) : dispute.state === 'EVIDENCE' ? (
            <CloseEvidenceWindowPanel
              disputeId={disputeId}
              expiresAt={dispute.evidenceWindowExpiresAt}
              elapsed={packet.submissionFlags.evidenceWindowElapsed}
            />
          ) : (
            <ResolutionForm disputeId={disputeId} terms={frozenTerms} record={latestRecord} />
          )}

          <AuditTrail disputeId={disputeId} visible={accountRole === 'ADMIN'} />
        </div>
      </div>
    </div>
  );
}

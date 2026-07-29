'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { useAuthStore } from '../../../../../lib/auth-store';
import { useEscrowFunding } from '../../../../../hooks/use-escrow-funding';
import { ApiError } from '../../../../../lib/api-error';
import { TermsPanel } from '../../../../../components/escrow/terms-panel';
import { FundingPanel } from '../../../../../components/escrow/funding-panel';
import { EvidenceViewer } from '../../../../../components/evidence/evidence-viewer';

export default function FundEscrowPage() {
  const params = useParams<{ id: string }>();
  const escrowId = params.id;
  const sessionStatus = useAuthStore((state) => state.status);
  const currentUserId = useAuthStore((state) => state.user?.id);

  const { escrowQuery, intentQuery, evidenceQuery, kycQuery } = useEscrowFunding(escrowId);

  if (sessionStatus === 'pending' || escrowQuery.isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-2/3 animate-pulse rounded bg-surface-2" />
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

  const isBuyer = escrow.parties.some(
    (party) => party.userId === currentUserId && party.role === 'BUYER',
  );
  const creationEvidence =
    evidenceQuery.data?.items.filter((item) => item.phase === 'AT_CREATION') ?? [];

  return (
    <div>
      <Link
        href={`/escrow/${escrow.id}`}
        className="inline-flex items-center gap-1.5 text-[13px] text-mute hover:text-vellum"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to the escrow
      </Link>

      <h1 className="mt-4 font-display text-[1.75rem] leading-tight text-vellum sm:text-[2rem]">
        Fund this escrow
      </h1>
      <p className="mt-2 max-w-xl text-sm text-fog">
        Take one last look at what was agreed and the condition the item was in when this escrow was
        opened. Once you pay, the money sits with Mezzo — not the seller.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section>
          <h2 className="mb-3 text-sm font-medium text-vellum">Evidence at creation</h2>
          {evidenceQuery.isLoading ? (
            <div className="h-32 animate-pulse rounded-xl bg-surface-2" />
          ) : (
            <EvidenceViewer items={creationEvidence} emptyLabel="No creation evidence on file" />
          )}
        </section>

        <div className="space-y-6">
          {escrow.terms ? <TermsPanel terms={escrow.terms} frozen /> : null}
          <div className="rounded-xl border border-line-soft bg-surface p-4">
            <h2 className="mb-3 text-sm font-medium text-vellum">Payment</h2>
            {intentQuery.isLoading || kycQuery.isLoading ? (
              <div className="h-24 animate-pulse rounded-lg bg-surface-2" />
            ) : (
              <FundingPanel
                escrow={escrow}
                intent={intentQuery.data?.intent ?? null}
                kycStatus={kycQuery.data ?? null}
                isBuyer={isBuyer}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import type { DisputePacketResponse, EscrowRole } from '@mezzo/shared-types';
import { EyeOff } from 'lucide-react';
import { EvidenceViewer } from '../evidence/evidence-viewer';

interface DisputeEvidenceColumnsProps {
  packet: DisputePacketResponse;
  viewerRole: EscrowRole | null;
  isArbiter: boolean;
}

function bothPartiesVisible(packet: DisputePacketResponse): boolean {
  const { submissionFlags, dispute } = packet;
  return (
    (submissionFlags.buyerSubmitted && submissionFlags.sellerSubmitted) ||
    submissionFlags.evidenceWindowElapsed ||
    dispute.state === 'UNDER_REVIEW' ||
    dispute.state === 'RESOLVED'
  );
}

export function DisputeEvidenceColumns({
  packet,
  viewerRole,
  isArbiter,
}: DisputeEvidenceColumnsProps) {
  const revealed = isArbiter || bothPartiesVisible(packet);

  const columns: { role: EscrowRole; heading: string }[] = [
    { role: 'BUYER', heading: viewerRole === 'BUYER' ? 'Your evidence' : "Buyer's evidence" },
    { role: 'SELLER', heading: viewerRole === 'SELLER' ? 'Your evidence' : "Seller's evidence" },
  ];

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      {columns.map((column) => {
        const isViewer = column.role === viewerRole;
        const items = column.role === 'BUYER' ? packet.buyerEvidence : packet.sellerEvidence;
        const hidden = !revealed && !isViewer;

        return (
          <section key={column.role} aria-label={column.heading}>
            <h3 className="mb-3 text-sm font-medium text-vellum">{column.heading}</h3>
            {hidden ? (
              <div className="flex flex-col items-center rounded-xl border border-dashed border-line px-4 py-10 text-center text-[13px] text-mute">
                <EyeOff className="mb-2 h-4 w-4" />
                Visible once both parties have submitted or the evidence window closes.
              </div>
            ) : (
              <EvidenceViewer items={items} emptyLabel="No evidence submitted" />
            )}
          </section>
        );
      })}
    </div>
  );
}

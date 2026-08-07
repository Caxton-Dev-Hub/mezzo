'use client';

import { useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { EvidenceCapture } from '../evidence/evidence-capture';

interface SellerRebuttalPanelProps {
  escrowId: string;
  disputeId: string;
}

export function SellerRebuttalPanel({ escrowId, disputeId }: SellerRebuttalPanelProps) {
  const queryClient = useQueryClient();
  const lastCount = useRef(0);

  const handleConfirmedCountChange = useCallback(
    (count: number) => {
      if (count > lastCount.current) {
        lastCount.current = count;
        void queryClient.invalidateQueries({ queryKey: ['dispute', disputeId] });
      }
    },
    [queryClient, disputeId],
  );

  return (
    <section
      aria-label="Respond to this dispute"
      className="rounded-xl border border-line-soft bg-surface shadow-card p-4"
    >
      <h2 className="text-sm font-medium text-vellum">Respond to this dispute</h2>
      <p className="mt-1 text-[13px] text-fog">
        Add photos or video of the item as you sent it, plus any shipping proof such as a waybill or
        courier receipt. Anything you add here goes to the arbiter with the rest of the packet.
      </p>
      <div className="mt-4">
        <EvidenceCapture
          escrowId={escrowId}
          phase="AT_DELIVERY"
          onConfirmedCountChange={handleConfirmedCountChange}
        />
      </div>
    </section>
  );
}

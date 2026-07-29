'use client';

import { useState } from 'react';
import { EvidenceCapture } from '../../evidence/evidence-capture';
import { useEscrowWizardStore } from '../../../lib/escrow-wizard-store';
import { Button } from '../../ui/button';

export function StepEvidence({ onAdvance }: { onAdvance: () => void }) {
  const escrow = useEscrowWizardStore((state) => state.escrow);
  const [confirmedCount, setConfirmedCount] = useState(0);

  if (!escrow) {
    return null;
  }

  return (
    <div>
      <p className="text-sm text-fog">
        Document the item&apos;s condition before you invite the other party. At least one photo is
        required.
      </p>

      <div className="mt-5">
        <EvidenceCapture escrowId={escrow.id} phase="AT_CREATION" onConfirmedCountChange={setConfirmedCount} />
      </div>

      <Button type="button" className="mt-6 w-full" disabled={confirmedCount === 0} onClick={onAdvance}>
        Continue{confirmedCount > 0 ? ` (${confirmedCount} photo${confirmedCount === 1 ? '' : 's'})` : ''}
      </Button>
    </div>
  );
}

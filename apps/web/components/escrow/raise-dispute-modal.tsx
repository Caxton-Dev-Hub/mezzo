'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DisputeReasonCode } from '@mezzo/shared-types';
import { Modal } from '../ui/modal';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Select } from '../ui/select';
import { Textarea } from '../ui/textarea';
import { EvidenceCapture } from '../evidence/evidence-capture';
import { raiseDispute } from '../../lib/dispute-client';
import { DISPUTE_REASON_LABELS } from '../../lib/dispute-labels';
import { ApiError } from '../../lib/api-error';

interface RaiseDisputeModalProps {
  escrowId: string;
  open: boolean;
  onClose: () => void;
}

export function RaiseDisputeModal({ escrowId, open, onClose }: RaiseDisputeModalProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [reasonCode, setReasonCode] = useState<DisputeReasonCode | ''>('');
  const [statement, setStatement] = useState('');
  const [confirmedEvidenceCount, setConfirmedEvidenceCount] = useState(0);

  const mutation = useMutation({
    mutationFn: () => raiseDispute(escrowId, { reasonCode: reasonCode as DisputeReasonCode, statement }),
    onSuccess: (dispute) => {
      queryClient.invalidateQueries({ queryKey: ['escrow', escrowId] });
      queryClient.invalidateQueries({ queryKey: ['escrow-events', escrowId] });
      queryClient.invalidateQueries({ queryKey: ['escrow-disputes', escrowId] });
      onClose();
      router.push(`/disputes/${dispute.id}`);
    },
  });

  const canSubmit = reasonCode !== '' && statement.trim().length > 0 && confirmedEvidenceCount > 0;

  return (
    <Modal open={open} onClose={onClose} title="Raise a dispute" className="max-w-xl">
      <p className="text-sm text-fog">
        Raising a dispute freezes this escrow until an arbiter reviews it. You&apos;ll need at least
        one photo or video showing the problem.
      </p>

      <div className="mt-5">
        <Label htmlFor="dispute-reason">Reason</Label>
        <Select
          id="dispute-reason"
          value={reasonCode}
          onChange={(event) => setReasonCode(event.target.value as DisputeReasonCode)}
        >
          <option value="" disabled>
            Select a reason
          </option>
          {Object.entries(DISPUTE_REASON_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>

      <div className="mt-4">
        <Label htmlFor="dispute-statement">What happened?</Label>
        <Textarea
          id="dispute-statement"
          rows={4}
          value={statement}
          onChange={(event) => setStatement(event.target.value)}
          placeholder="Describe the problem with this order"
        />
      </div>

      <div className="mt-4">
        <Label>Evidence</Label>
        <EvidenceCapture
          escrowId={escrowId}
          phase="AT_DELIVERY"
          onConfirmedCountChange={setConfirmedEvidenceCount}
        />
      </div>

      {mutation.error ? (
        <p role="alert" className="mt-4 text-[13px] text-danger">
          {mutation.error instanceof ApiError
            ? mutation.error.message
            : 'Could not raise the dispute. Please try again.'}
        </p>
      ) : null}

      <div className="mt-6 flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onClose} disabled={mutation.isPending}>
          Cancel
        </Button>
        <Button
          type="button"
          className="bg-danger text-vellum hover:bg-danger-deep"
          disabled={!canSubmit}
          loading={mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          Raise dispute
        </Button>
      </div>
    </Modal>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { EscrowDetailResponse, EscrowState } from '@mezzo/shared-types';
import { Button, buttonVariants } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { ConfirmModal } from '../ui/confirm-modal';
import { RaiseDisputeModal } from './raise-dispute-modal';
import {
  acceptEscrowTerms,
  cancelEscrow,
  confirmEscrowDelivery,
  releaseEscrow,
  shipEscrow,
} from '../../lib/escrow-client';
import { ApiError } from '../../lib/api-error';

type OpenModal = 'cancel' | 'ship' | 'confirm-delivery' | 'release' | 'dispute' | null;

const RESTING_MESSAGES: Partial<Record<EscrowState, string>> = {
  DISPUTED: 'This escrow is frozen while an arbiter reviews the dispute.',
  RESOLVED_RELEASE: 'The arbiter resolved this in the seller’s favour. Settlement is in progress.',
  RESOLVED_REFUND: 'The arbiter resolved this in the buyer’s favour. Settlement is in progress.',
  RELEASED: 'Funds were released to the seller. This escrow is complete.',
  REFUNDED: 'Funds were refunded to the buyer. This escrow is complete.',
  CANCELLED: 'This escrow was cancelled.',
  EXPIRED: 'This escrow expired before both parties agreed to the terms.',
};

interface ActionBarProps {
  escrow: EscrowDetailResponse;
  currentUserId: string;
}

export function ActionBar({ escrow, currentUserId }: ActionBarProps) {
  const queryClient = useQueryClient();
  const [openModal, setOpenModal] = useState<OpenModal>(null);
  const [trackingReference, setTrackingReference] = useState('');

  const myParty = escrow.parties.find((party) => party.userId === currentUserId);
  const isBuyer = myParty?.role === 'BUYER';
  const isSeller = myParty?.role === 'SELLER';
  const iHaveAcceptedTerms = myParty?.termsAcceptedAt != null;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['escrow', escrow.id] });
    queryClient.invalidateQueries({ queryKey: ['escrow-events', escrow.id] });
  };

  const acceptTermsMutation = useMutation({
    mutationFn: () => acceptEscrowTerms(escrow.id),
    onSuccess: invalidate,
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelEscrow(escrow.id),
    onSuccess: () => {
      invalidate();
      setOpenModal(null);
    },
  });

  const shipMutation = useMutation({
    mutationFn: () => shipEscrow(escrow.id, trackingReference.trim() || undefined),
    onSuccess: () => {
      invalidate();
      setOpenModal(null);
    },
  });

  const confirmDeliveryMutation = useMutation({
    mutationFn: () => confirmEscrowDelivery(escrow.id),
    onSuccess: () => {
      invalidate();
      setOpenModal(null);
    },
  });

  const releaseMutation = useMutation({
    mutationFn: () => releaseEscrow(escrow.id),
    onSuccess: () => {
      invalidate();
      setOpenModal(null);
    },
  });

  const errorMessage = (error: unknown): string | null => {
    if (!error) return null;
    return error instanceof ApiError ? error.message : 'Something went wrong. Please try again.';
  };

  const canCancel = escrow.state === 'PENDING_COUNTERPARTY' || escrow.state === 'AGREED';

  return (
    <div className="space-y-3">
      {escrow.state === 'PENDING_COUNTERPARTY' && escrow.parties.length === 2 ? (
        iHaveAcceptedTerms ? (
          <p className="text-[13px] text-mute">Waiting for the other party to accept the terms.</p>
        ) : (
          <Button
            type="button"
            className="w-full"
            loading={acceptTermsMutation.isPending}
            onClick={() => acceptTermsMutation.mutate()}
          >
            Accept terms
          </Button>
        )
      ) : null}

      {escrow.state === 'PENDING_COUNTERPARTY' && escrow.parties.length === 1 ? (
        <p className="text-[13px] text-mute">Waiting for the counterparty to accept your invite.</p>
      ) : null}

      {acceptTermsMutation.error ? (
        <p role="alert" className="text-[13px] text-danger">
          {errorMessage(acceptTermsMutation.error)}
        </p>
      ) : null}

      {escrow.state === 'AGREED' && isBuyer ? (
        <Link href={`/escrow/${escrow.id}/fund`} className={buttonVariants({ className: 'w-full' })}>
          Fund escrow
        </Link>
      ) : null}
      {escrow.state === 'AGREED' && !isBuyer ? (
        <p className="text-[13px] text-mute">Waiting for the buyer to fund the escrow.</p>
      ) : null}

      {escrow.state === 'FUNDED' && isSeller ? (
        <Button type="button" className="w-full" onClick={() => setOpenModal('ship')}>
          Mark as shipped
        </Button>
      ) : null}
      {escrow.state === 'FUNDED' && isBuyer ? (
        <p className="text-[13px] text-mute">Waiting for the seller to ship.</p>
      ) : null}

      {escrow.state === 'SHIPPED' && isBuyer ? (
        <Button type="button" className="w-full" onClick={() => setOpenModal('confirm-delivery')}>
          Confirm delivery
        </Button>
      ) : null}
      {escrow.state === 'SHIPPED' && isSeller ? (
        <p className="text-[13px] text-mute">Waiting for the buyer to confirm delivery.</p>
      ) : null}

      {escrow.state === 'DELIVERED' && isBuyer ? (
        <div className="space-y-2">
          <Button type="button" className="w-full" onClick={() => setOpenModal('release')}>
            Release funds
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="w-full border-danger/40 text-danger hover:border-danger"
            onClick={() => setOpenModal('dispute')}
          >
            Raise a dispute
          </Button>
        </div>
      ) : null}
      {escrow.state === 'DELIVERED' && isSeller ? (
        <p className="text-[13px] text-mute">
          The buyer is inspecting the item. Funds release automatically once the inspection window
          ends, unless a dispute is raised.
        </p>
      ) : null}

      {RESTING_MESSAGES[escrow.state] ? (
        <p className="text-[13px] text-mute">{RESTING_MESSAGES[escrow.state]}</p>
      ) : null}

      {escrow.state === 'DRAFT' && escrow.parties.length === 1 ? (
        <p className="text-[13px] text-mute">
          Add at least one photo of the item, then invite the other party from the creation wizard to
          continue.
        </p>
      ) : null}

      {canCancel ? (
        <Button
          type="button"
          variant="ghost"
          className="w-full text-mute hover:text-danger"
          onClick={() => setOpenModal('cancel')}
        >
          Cancel escrow
        </Button>
      ) : null}

      <ConfirmModal
        open={openModal === 'cancel'}
        title="Cancel this escrow?"
        description="This ends the escrow for both parties and cannot be undone."
        confirmLabel="Cancel escrow"
        destructive
        loading={cancelMutation.isPending}
        error={errorMessage(cancelMutation.error)}
        onConfirm={() => cancelMutation.mutate()}
        onClose={() => setOpenModal(null)}
      />

      <ConfirmModal
        open={openModal === 'ship'}
        title="Mark as shipped?"
        description="Let the buyer know the item is on its way. Adding a tracking reference is optional."
        confirmLabel="Mark as shipped"
        loading={shipMutation.isPending}
        error={errorMessage(shipMutation.error)}
        onConfirm={() => shipMutation.mutate()}
        onClose={() => setOpenModal(null)}
      >
        <Label htmlFor="tracking-reference">Tracking reference (optional)</Label>
        <Input
          id="tracking-reference"
          value={trackingReference}
          onChange={(event) => setTrackingReference(event.target.value)}
          placeholder="e.g. courier tracking number"
        />
      </ConfirmModal>

      <ConfirmModal
        open={openModal === 'confirm-delivery'}
        title="Confirm delivery?"
        description="This starts your inspection window. You'll be able to release funds or raise a dispute afterwards."
        confirmLabel="Confirm delivery"
        loading={confirmDeliveryMutation.isPending}
        error={errorMessage(confirmDeliveryMutation.error)}
        onConfirm={() => confirmDeliveryMutation.mutate()}
        onClose={() => setOpenModal(null)}
      />

      <ConfirmModal
        open={openModal === 'release'}
        title="Release funds to the seller?"
        description="This immediately pays the seller and cannot be undone."
        confirmLabel="Release funds"
        loading={releaseMutation.isPending}
        error={errorMessage(releaseMutation.error)}
        onConfirm={() => releaseMutation.mutate()}
        onClose={() => setOpenModal(null)}
      />

      <RaiseDisputeModal
        escrowId={escrow.id}
        open={openModal === 'dispute'}
        onClose={() => setOpenModal(null)}
      />
    </div>
  );
}

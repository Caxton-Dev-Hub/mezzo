'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../lib/auth-store';
import { getEscrow } from '../lib/escrow-client';
import { getEvidenceBundle } from '../lib/evidence-client';
import { getLatestPaymentIntent } from '../lib/payments-client';
import { getKycStatus } from '../lib/kyc-client';

const CONFIRMATION_POLL_MS = 4000;

export function useEscrowFunding(escrowId: string) {
  const sessionStatus = useAuthStore((state) => state.status);
  const enabled = sessionStatus === 'authenticated';

  const intentQuery = useQuery({
    queryKey: ['payment-intent', escrowId],
    queryFn: () => getLatestPaymentIntent(escrowId),
    enabled,
    refetchInterval: (query) =>
      query.state.data?.intent?.status === 'PENDING' ? CONFIRMATION_POLL_MS : false,
  });

  const awaitingConfirmation = intentQuery.data?.intent?.status === 'PENDING';

  const escrowQuery = useQuery({
    queryKey: ['escrow', escrowId],
    queryFn: () => getEscrow(escrowId),
    enabled,
    refetchInterval: awaitingConfirmation ? CONFIRMATION_POLL_MS : false,
  });

  const evidenceQuery = useQuery({
    queryKey: ['evidence', escrowId],
    queryFn: () => getEvidenceBundle(escrowId),
    enabled: escrowQuery.isSuccess,
  });

  const kycQuery = useQuery({
    queryKey: ['kyc-status'],
    queryFn: getKycStatus,
    enabled,
  });

  return { escrowQuery, intentQuery, evidenceQuery, kycQuery };
}

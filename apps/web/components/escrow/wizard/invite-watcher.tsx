'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { getEscrow } from '../../../lib/escrow-client';
import { useEscrowWizardStore } from '../../../lib/escrow-wizard-store';
import { useChatSocket } from '../../../hooks/use-chat-socket';

const POLL_INTERVAL_MS = 8_000;

interface InviteWatcherProps {
  escrowId: string;
}

export function InviteWatcher({ escrowId }: InviteWatcherProps) {
  const router = useRouter();
  const reset = useEscrowWizardStore((state) => state.reset);

  const escrowQuery = useQuery({
    queryKey: ['escrow', escrowId],
    queryFn: () => getEscrow(escrowId),
    refetchInterval: POLL_INTERVAL_MS,
  });
  const { refetch } = escrowQuery;

  useChatSocket(escrowId, {
    onEscrowUpdated: () => {
      void refetch();
    },
  });

  const counterpartyJoined = (escrowQuery.data?.parties.length ?? 0) > 1;

  useEffect(() => {
    if (!counterpartyJoined) {
      return;
    }
    router.replace(`/escrow/${escrowId}`);
    return reset;
  }, [counterpartyJoined, escrowId, reset, router]);

  return (
    <p className="mt-3 text-[13px] text-mute">
      {counterpartyJoined
        ? 'Accepted — opening the escrow…'
        : 'Waiting for the other party to accept. This opens the escrow the moment they do.'}
    </p>
  );
}

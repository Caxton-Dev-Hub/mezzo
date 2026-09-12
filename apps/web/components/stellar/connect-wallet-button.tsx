'use client';

import { useAuthStore } from '../../lib/auth-store';
import { stellarRailMode } from '../../lib/stellar-config';
import { WalletUnavailableError } from '../../lib/stellar-wallet';
import {
  useConnectStellarWallet,
  useDisconnectStellarWallet,
  useStellarWallet,
  useStellarWalletSessionSync,
  useWalletAddress,
} from '../../hooks/use-stellar-wallet';
import { Button } from '../ui/button';
import { StellarLogo } from './stellar-logo';

const WALLET_DIRECTORY_URL = 'https://stellar.org/ecosystem/wallets';

function shortenAccountId(accountId: string): string {
  return `${accountId.slice(0, 4)}…${accountId.slice(-4)}`;
}

export function ConnectWalletButton({ className }: { className?: string }) {
  const authenticated = useAuthStore((state) => state.status) === 'authenticated';
  const live = stellarRailMode() === 'live';
  const enabled = authenticated && live;

  useStellarWalletSessionSync();

  const wallet = useStellarWallet(enabled);
  const walletAddress = useWalletAddress(enabled);
  const connect = useConnectStellarWallet();
  const disconnect = useDisconnectStellarWallet();

  if (!live) {
    return (
      <span
        className={`inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-[13px] text-fog shadow-hairline ${className ?? ''}`}
        data-testid="stellar-coming-soon"
      >
        <StellarLogo className="h-4 w-4 text-vellum" />
        <span>Stellar</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-mute">
          Coming soon
        </span>
      </span>
    );
  }

  const linked = wallet.data;
  const drifted = Boolean(linked && walletAddress.data && walletAddress.data !== linked.accountId);

  if (linked) {
    return (
      <div className={`flex flex-col items-end gap-1 ${className ?? ''}`}>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => disconnect.mutate()}
          loading={disconnect.isPending}
          title={linked.accountId}
        >
          <StellarLogo className="h-4 w-4" />
          <span className="font-mono text-[12px]">{shortenAccountId(linked.accountId)}</span>
        </Button>
        {drifted ? (
          <button
            type="button"
            onClick={() => connect.mutate()}
            className="text-[11px] text-mute underline decoration-line underline-offset-2 hover:text-vellum"
            data-testid="stellar-wallet-drift"
          >
            Your wallet is on a different account — re-link
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-end gap-1 ${className ?? ''}`}>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => connect.mutate()}
        loading={connect.isPending}
      >
        <StellarLogo className="h-4 w-4" />
        Connect wallet
      </Button>
      {connect.error ? (
        <p className="text-[11px] text-mute">
          {connect.error instanceof WalletUnavailableError ? (
            <a
              href={WALLET_DIRECTORY_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="underline decoration-line underline-offset-2 hover:text-vellum"
            >
              No Stellar wallet detected — get one
            </a>
          ) : (
            connect.error.message
          )}
        </p>
      ) : null}
    </div>
  );
}

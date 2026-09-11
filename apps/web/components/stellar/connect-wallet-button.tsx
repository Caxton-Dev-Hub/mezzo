'use client';

import { useAuthStore } from '../../lib/auth-store';
import { stellarRailMode } from '../../lib/stellar-config';
import { FREIGHTER_INSTALL_URL, WalletUnavailableError } from '../../lib/stellar-wallet';
import {
  useConnectStellarWallet,
  useDisconnectStellarWallet,
  useStellarWallet,
} from '../../hooks/use-stellar-wallet';
import { Button } from '../ui/button';
import { StellarLogo } from './stellar-logo';

function shortenAccountId(accountId: string): string {
  return `${accountId.slice(0, 4)}…${accountId.slice(-4)}`;
}

export function ConnectWalletButton({ className }: { className?: string }) {
  const authenticated = useAuthStore((state) => state.status) === 'authenticated';
  const mode = stellarRailMode();
  const wallet = useStellarWallet(authenticated && mode === 'live');
  const connect = useConnectStellarWallet();
  const disconnect = useDisconnectStellarWallet();

  if (mode !== 'live') {
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

  if (wallet.data) {
    return (
      <Button
        variant="secondary"
        size="sm"
        className={className}
        onClick={() => disconnect.mutate()}
        loading={disconnect.isPending}
        title={wallet.data.accountId}
      >
        <StellarLogo className="h-4 w-4" />
        <span className="font-mono text-[12px]">{shortenAccountId(wallet.data.accountId)}</span>
      </Button>
    );
  }

  const unavailable = connect.error instanceof WalletUnavailableError;

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
          {unavailable ? (
            <a
              href={FREIGHTER_INSTALL_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="underline decoration-line underline-offset-2 hover:text-vellum"
            >
              Install Freighter to connect
            </a>
          ) : (
            connect.error.message
          )}
        </p>
      ) : null}
    </div>
  );
}

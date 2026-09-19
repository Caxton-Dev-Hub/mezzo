'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, CheckCircle2, Copy, Loader2, TriangleAlert } from 'lucide-react';
import type { EscrowDetailResponse, StellarEscrowResponse } from '@mezzo/shared-types';
import { Button } from '../ui/button';
import { StellarLogo } from './stellar-logo';
import { ApiError } from '../../lib/api-error';
import {
  useConfirmStellarDeposit,
  useOpenStellarFunding,
  useSimulateStellarDeposit,
  useStellarEscrow,
  useStellarRailConfig,
} from '../../hooks/use-stellar-wallet';

const TRANSACTION_HASH = /^[0-9a-f]{64}$/;

const MISMATCH_REASONS: Record<string, string> = {
  DESTINATION: 'That payment went to a different account.',
  MEMO: 'That payment is missing this escrow’s memo, so it cannot be matched to it.',
  ASSET: 'That payment was in a different asset. Check both the code and the issuer.',
  AMOUNT: 'That payment was for a different amount. It has to match to the cent.',
  ALREADY_APPLIED: 'This escrow has already been funded by another payment.',
};

function describe(error: unknown): string {
  if (error instanceof ApiError) {
    const reason = (error.details as { reason?: string } | undefined)?.reason;
    if (reason && MISMATCH_REASONS[reason]) {
      return MISMATCH_REASONS[reason];
    }
    return error.message;
  }
  return 'Something went wrong. Try again.';
}

function CopyField({
  label,
  value,
  mono = true,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard?.writeText(value).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      },
      () => undefined,
    );
  };

  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.12em] text-mute">{label}</p>
      <div className="mt-1 flex items-start gap-2">
        <p
          className={`min-w-0 flex-1 break-all text-[13px] text-vellum ${mono ? 'font-mono' : ''}`}
        >
          {value}
        </p>
        <button
          type="button"
          onClick={copy}
          aria-label={`Copy ${label}`}
          className="shrink-0 rounded p-1 text-mute hover:text-vellum"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

interface StellarFundingPanelProps {
  escrow: EscrowDetailResponse;
  isBuyer: boolean;
}

export function StellarFundingPanel({ escrow, isBuyer }: StellarFundingPanelProps) {
  const [hash, setHash] = useState('');

  const config = useStellarRailConfig(true);
  const stellarEscrow = useStellarEscrow(escrow.id, Boolean(config.data?.enabled));
  const open = useOpenStellarFunding(escrow.id);
  const confirm = useConfirmStellarDeposit(escrow.id);
  const simulate = useSimulateStellarDeposit(escrow.id);

  if (config.isLoading) {
    return <div className="h-24 animate-pulse rounded-lg bg-surface-2" />;
  }

  if (!config.data?.enabled) {
    return null;
  }

  const currency = escrow.terms?.price.currency;
  if (currency && currency !== 'USD') {
    return (
      <p className="text-[13px] text-mute">
        Paying on Stellar is only available for escrows priced in USD. This one is in {currency}.
      </p>
    );
  }

  const deposit: StellarEscrowResponse | undefined = stellarEscrow.data ?? open.data;
  const settled = deposit?.status === 'SETTLED' || deposit?.status === 'SETTLING';

  if (deposit?.status === 'FUNDED' || settled) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-mint/30 bg-mint/5 p-4">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-mint" />
        <div className="min-w-0">
          <p className="text-sm text-vellum">Deposit verified on Stellar</p>
          <p className="mt-1 text-[13px] text-fog">
            {deposit.expectedAssetAmount} {deposit.asset.code} is held in escrow until you confirm
            the item is what you agreed.
          </p>
          {deposit.fundingTransactionHash ? (
            <p className="mt-2 break-all font-mono text-[11px] text-mute">
              {deposit.fundingTransactionHash}
            </p>
          ) : null}
          <Link
            href={`/escrow/${escrow.id}`}
            className="mt-3 inline-block text-[13px] text-mint underline underline-offset-4"
          >
            Back to the escrow
          </Link>
        </div>
      </div>
    );
  }

  if (!isBuyer) {
    return <p className="text-[13px] text-mute">Only the buyer can fund this escrow on Stellar.</p>;
  }

  if (escrow.state !== 'AGREED') {
    return null;
  }

  if (!deposit) {
    return (
      <div>
        <p className="text-[13px] text-fog">
          Pay in {config.data.asset?.code ?? 'USDC'} from your own Stellar wallet. Mezzo holds the
          deposit in escrow exactly as it would a card payment.
        </p>
        <Button
          className="mt-3"
          variant="secondary"
          size="sm"
          onClick={() => open.mutate()}
          loading={open.isPending}
        >
          <StellarLogo className="h-4 w-4" />
          Get a deposit address
        </Button>
        {open.error ? <p className="mt-2 text-[12px] text-danger">{describe(open.error)}</p> : null}
      </div>
    );
  }

  const hashValid = TRANSACTION_HASH.test(hash.trim());

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-xl border border-line-soft bg-surface-2 p-4">
        <CopyField label="Send exactly" value={`${deposit.expectedAssetAmount}`} />
        <CopyField label="Asset" value={deposit.asset.code} mono={false} />
        <CopyField label="Issuer" value={deposit.asset.issuer} />
        <CopyField label="To account" value={deposit.depositAccountId} />
        <CopyField label="Memo (text)" value={deposit.memo} />
      </div>

      <div className="flex items-start gap-2.5 rounded-lg border border-line-strong bg-surface-2 p-3">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-fog" />
        <p className="text-[12px] text-fog">
          The memo is what ties your payment to this escrow. A payment sent without it, or for a
          different amount, cannot be credited and will not be refunded automatically.
        </p>
      </div>

      <div>
        <label htmlFor="stellar-tx-hash" className="text-[13px] text-vellum">
          Paste the transaction hash once you have paid
        </label>
        <input
          id="stellar-tx-hash"
          value={hash}
          onChange={(event) => setHash(event.target.value)}
          spellCheck={false}
          autoComplete="off"
          placeholder="64 hexadecimal characters"
          className="mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-[12px] text-vellum outline-none focus:border-mint"
        />
        <Button
          className="mt-3"
          size="sm"
          disabled={!hashValid}
          loading={confirm.isPending}
          onClick={() => confirm.mutate(hash.trim())}
        >
          Confirm deposit
        </Button>
        {hash.trim() && !hashValid ? (
          <p className="mt-2 text-[12px] text-mute">
            A Stellar transaction hash is 64 hexadecimal characters.
          </p>
        ) : null}
        {confirm.error ? (
          <p className="mt-2 text-[12px] text-danger">{describe(confirm.error)}</p>
        ) : null}
      </div>

      {config.data.simulated ? (
        <div className="border-t border-line-soft pt-3">
          <p className="text-[12px] text-mute">
            This server runs a simulated Stellar network, so no real payment is possible.
          </p>
          <button
            type="button"
            onClick={() => simulate.mutate()}
            disabled={simulate.isPending}
            className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-mint underline underline-offset-4 disabled:opacity-60"
          >
            {simulate.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            Simulate the deposit
          </button>
          {simulate.error ? (
            <p className="mt-2 text-[12px] text-danger">{describe(simulate.error)}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

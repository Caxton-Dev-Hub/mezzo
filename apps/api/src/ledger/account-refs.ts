import { LedgerAccountType } from './entities/ledger-account-type.enum';
import { EntryDirection } from './entities/entry-direction.enum';
import { UnknownLedgerAccountRefError } from './errors/unknown-ledger-account-ref.error';

export function userWalletRef(userId: string): string {
  return `user:${userId}:wallet`;
}

export function escrowHoldingRef(escrowId: string): string {
  return `escrow:${escrowId}:holding`;
}

export function platformFeeRevenueRef(): string {
  return 'platform:fee_revenue';
}

export function providerClearingRef(provider: string): string {
  return `provider:${provider}:clearing`;
}

export function treasuryRef(name = 'main'): string {
  return `treasury:${name}`;
}

export interface ParsedAccountRef {
  type: LedgerAccountType;
  normalBalance: EntryDirection;
}

interface RefPattern extends ParsedAccountRef {
  regex: RegExp;
}

const REF_PATTERNS: readonly RefPattern[] = [
  { regex: /^user:[^:]+:wallet$/, type: LedgerAccountType.USER_WALLET, normalBalance: EntryDirection.CREDIT },
  {
    regex: /^escrow:[^:]+:holding$/,
    type: LedgerAccountType.ESCROW_HOLDING,
    normalBalance: EntryDirection.CREDIT,
  },
  {
    regex: /^platform:fee_revenue$/,
    type: LedgerAccountType.PLATFORM_FEE_REVENUE,
    normalBalance: EntryDirection.CREDIT,
  },
  {
    regex: /^provider:[^:]+:clearing$/,
    type: LedgerAccountType.PROVIDER_CLEARING,
    normalBalance: EntryDirection.DEBIT,
  },
  { regex: /^treasury:[^:]+$/, type: LedgerAccountType.TREASURY, normalBalance: EntryDirection.DEBIT },
];

export function parseAccountRef(ref: string): ParsedAccountRef {
  const match = REF_PATTERNS.find((pattern) => pattern.regex.test(ref));
  if (!match) {
    throw new UnknownLedgerAccountRefError(ref);
  }
  return { type: match.type, normalBalance: match.normalBalance };
}

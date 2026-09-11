import { Currency } from '../common/money/currency';
import { LedgerAccountType } from './entities/ledger-account-type.enum';
import { EntryDirection } from './entities/entry-direction.enum';
import { UnknownLedgerAccountRefError } from './errors/unknown-ledger-account-ref.error';

const CURRENCY_SUFFIX = '(?:NGN|USD)';

export function userWalletRef(userId: string, currency: Currency): string {
  return `user:${userId}:wallet:${currency}`;
}

export function escrowHoldingRef(escrowId: string): string {
  return `escrow:${escrowId}:holding`;
}

export function platformFeeRevenueRef(currency: Currency): string {
  return `platform:fee_revenue:${currency}`;
}

export function providerClearingRef(provider: string, currency: Currency): string {
  return `provider:${provider}:clearing:${currency}`;
}

export function treasuryRef(currency: Currency, name = 'main'): string {
  return `treasury:${name}:${currency}`;
}

export interface ParsedAccountRef {
  type: LedgerAccountType;
  normalBalance: EntryDirection;
}

interface RefPattern extends ParsedAccountRef {
  regex: RegExp;
}

const REF_PATTERNS: readonly RefPattern[] = [
  {
    regex: new RegExp(`^user:[^:]+:wallet:${CURRENCY_SUFFIX}$`),
    type: LedgerAccountType.USER_WALLET,
    normalBalance: EntryDirection.CREDIT,
  },
  {
    regex: /^escrow:[^:]+:holding$/,
    type: LedgerAccountType.ESCROW_HOLDING,
    normalBalance: EntryDirection.CREDIT,
  },
  {
    regex: new RegExp(`^platform:fee_revenue:${CURRENCY_SUFFIX}$`),
    type: LedgerAccountType.PLATFORM_FEE_REVENUE,
    normalBalance: EntryDirection.CREDIT,
  },
  {
    regex: new RegExp(`^provider:[^:]+:clearing:${CURRENCY_SUFFIX}$`),
    type: LedgerAccountType.PROVIDER_CLEARING,
    normalBalance: EntryDirection.DEBIT,
  },
  {
    regex: new RegExp(`^treasury:[^:]+:${CURRENCY_SUFFIX}$`),
    type: LedgerAccountType.TREASURY,
    normalBalance: EntryDirection.DEBIT,
  },
];

export function parseAccountRef(ref: string): ParsedAccountRef {
  const match = REF_PATTERNS.find((pattern) => pattern.regex.test(ref));
  if (!match) {
    throw new UnknownLedgerAccountRefError(ref);
  }
  return { type: match.type, normalBalance: match.normalBalance };
}

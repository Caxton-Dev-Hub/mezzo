import { AdminRiskItemResponse } from '@mezzo/shared-types';
import { Escrow } from '../database/entities/escrow.entity';
import { EscrowTerms } from '../database/entities/escrow-terms.entity';
import { Payout } from '../database/entities/payout.entity';
import { PaymentIntent } from '../database/entities/payment-intent.entity';
import { EscrowState } from '../escrow/entities/escrow-state.enum';
import { PayoutStatus } from '../payments/entities/payout-status.enum';
import { PaymentIntentStatus } from '../payments/entities/payment-intent-status.enum';

const MILLIS_PER_HOUR = 3_600_000;

export interface RiskThresholds {
  unshippedHours: number;
  inviteExpiryHours: number;
  disputeWindowHours: number;
  stalePayoutHours: number;
  staleIntentHours: number;
  unsettledHours: number;
}

export interface RiskInput {
  escrows: { escrow: Escrow; terms: EscrowTerms | null }[];
  payouts: Payout[];
  intents: PaymentIntent[];
  now: Date;
}

function overdueHours(deadline: Date, now: Date): number | null {
  const elapsed = now.getTime() - deadline.getTime();
  return elapsed > 0 ? Math.floor(elapsed / MILLIS_PER_HOUR) : null;
}

function addHours(from: Date, hours: number): Date {
  return new Date(from.getTime() + hours * MILLIS_PER_HOUR);
}

function escrowRisk(
  escrow: Escrow,
  terms: EscrowTerms | null,
  thresholds: RiskThresholds,
  now: Date,
): AdminRiskItemResponse | null {
  const amount = terms ? { amount: terms.priceAmount, currency: terms.priceCurrency } : null;

  const item = (
    reason: AdminRiskItemResponse['reason'],
    waitingSince: Date,
    deadline: Date,
  ): AdminRiskItemResponse | null => {
    const overdueByHours = overdueHours(deadline, now);
    return overdueByHours === null
      ? null
      : { kind: 'ESCROW', id: escrow.id, reason, escrowId: escrow.id, amount, waitingSince, overdueByHours };
  };

  switch (escrow.state) {
    case EscrowState.PENDING_COUNTERPARTY:
      return item(
        'AWAITING_COUNTERPARTY',
        escrow.updatedAt,
        addHours(escrow.updatedAt, thresholds.inviteExpiryHours),
      );
    case EscrowState.FUNDED:
      return item(
        'FUNDED_NOT_SHIPPED',
        escrow.updatedAt,
        addHours(escrow.updatedAt, thresholds.unshippedHours),
      );
    case EscrowState.DELIVERED: {
      if (!escrow.deliveredAt || !terms) {
        return null;
      }
      return item(
        'INSPECTION_OVERDUE',
        escrow.deliveredAt,
        addHours(escrow.deliveredAt, terms.inspectionWindowHours),
      );
    }
    case EscrowState.DISPUTED:
      return item(
        'DISPUTE_OPEN',
        escrow.updatedAt,
        addHours(escrow.updatedAt, thresholds.disputeWindowHours),
      );
    case EscrowState.RESOLVED_RELEASE:
    case EscrowState.RESOLVED_REFUND:
      return item(
        'RESOLUTION_NOT_SETTLED',
        escrow.updatedAt,
        addHours(escrow.updatedAt, thresholds.unsettledHours),
      );
    default:
      return null;
  }
}

function payoutRisk(
  payout: Payout,
  thresholds: RiskThresholds,
  now: Date,
): AdminRiskItemResponse | null {
  const amount = { amount: payout.amount, currency: payout.currency };

  if (payout.status === PayoutStatus.FAILED) {
    return {
      kind: 'PAYOUT',
      id: payout.id,
      reason: 'PAYOUT_FAILED',
      escrowId: null,
      amount,
      waitingSince: payout.updatedAt,
      overdueByHours: overdueHours(payout.updatedAt, now) ?? 0,
    };
  }

  if (payout.status !== PayoutStatus.PENDING) {
    return null;
  }

  const overdueByHours = overdueHours(
    addHours(payout.createdAt, thresholds.stalePayoutHours),
    now,
  );

  return overdueByHours === null
    ? null
    : {
        kind: 'PAYOUT',
        id: payout.id,
        reason: 'PAYOUT_STUCK',
        escrowId: null,
        amount,
        waitingSince: payout.createdAt,
        overdueByHours,
      };
}

function intentRisk(
  intent: PaymentIntent,
  thresholds: RiskThresholds,
  now: Date,
): AdminRiskItemResponse | null {
  const amount = { amount: intent.amount, currency: intent.currency };

  if (intent.status === PaymentIntentStatus.QUARANTINED) {
    return {
      kind: 'PAYMENT_INTENT',
      id: intent.id,
      reason: 'PAYMENT_QUARANTINED',
      escrowId: intent.escrowId,
      amount,
      waitingSince: intent.updatedAt,
      overdueByHours: overdueHours(intent.updatedAt, now) ?? 0,
    };
  }

  if (intent.status !== PaymentIntentStatus.PENDING) {
    return null;
  }

  const overdueByHours = overdueHours(
    addHours(intent.createdAt, thresholds.staleIntentHours),
    now,
  );

  return overdueByHours === null
    ? null
    : {
        kind: 'PAYMENT_INTENT',
        id: intent.id,
        reason: 'PAYMENT_INTENT_STUCK',
        escrowId: intent.escrowId,
        amount,
        waitingSince: intent.createdAt,
        overdueByHours,
      };
}

export function computeRiskItems(
  input: RiskInput,
  thresholds: RiskThresholds,
): AdminRiskItemResponse[] {
  const items: AdminRiskItemResponse[] = [];

  for (const { escrow, terms } of input.escrows) {
    const risk = escrowRisk(escrow, terms, thresholds, input.now);
    if (risk) {
      items.push(risk);
    }
  }

  for (const payout of input.payouts) {
    const risk = payoutRisk(payout, thresholds, input.now);
    if (risk) {
      items.push(risk);
    }
  }

  const latestIntentByEscrow = new Map<string, PaymentIntent>();
  for (const intent of input.intents) {
    const latest = latestIntentByEscrow.get(intent.escrowId);
    if (!latest || intent.createdAt > latest.createdAt) {
      latestIntentByEscrow.set(intent.escrowId, intent);
    }
  }

  for (const intent of input.intents) {
    const superseded = latestIntentByEscrow.get(intent.escrowId) !== intent;
    if (superseded && intent.status === PaymentIntentStatus.PENDING) {
      continue;
    }
    const risk = intentRisk(intent, thresholds, input.now);
    if (risk) {
      items.push(risk);
    }
  }

  return items.sort((a, b) => b.overdueByHours - a.overdueByHours);
}

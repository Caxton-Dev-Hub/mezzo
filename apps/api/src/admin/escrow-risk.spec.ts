import { Escrow } from '../database/entities/escrow.entity';
import { EscrowTerms } from '../database/entities/escrow-terms.entity';
import { Payout } from '../database/entities/payout.entity';
import { PaymentIntent } from '../database/entities/payment-intent.entity';
import { EscrowState } from '../escrow/entities/escrow-state.enum';
import { PayoutStatus } from '../payments/entities/payout-status.enum';
import { PaymentIntentStatus } from '../payments/entities/payment-intent-status.enum';
import { computeRiskItems, RiskThresholds } from './escrow-risk';

const NOW = new Date('2026-08-13T12:00:00.000Z');

const thresholds: RiskThresholds = {
  unshippedHours: 48,
  inviteExpiryHours: 72,
  disputeWindowHours: 72,
  stalePayoutHours: 24,
  staleIntentHours: 6,
  unsettledHours: 1,
};

function hoursAgo(hours: number): Date {
  return new Date(NOW.getTime() - hours * 3_600_000);
}

function buildEscrow(state: EscrowState, updatedAt: Date, deliveredAt: Date | null = null): Escrow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    code: 'ESC-000001',
    state,
    version: 1,
    trackingReference: null,
    deliveredAt,
    createdAt: hoursAgo(200),
    updatedAt,
  };
}

function buildTerms(inspectionWindowHours = 24): EscrowTerms {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    escrowId: '11111111-1111-4111-8111-111111111111',
    escrow: buildEscrow(EscrowState.FUNDED, NOW),
    priceAmount: 5_000_000,
    priceCurrency: 'NGN',
    inspectionWindowHours,
    deliveryMethod: 'Courier',
    itemDescription: 'A camera',
    feeBps: 100,
    requiresVerification: true,
    agreementText: null,
    createdAt: hoursAgo(200),
    updatedAt: hoursAgo(200),
  };
}

function buildPayout(status: PayoutStatus, createdAt: Date, updatedAt: Date): Payout {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    sellerId: '44444444-4444-4444-8444-444444444444',
    seller: null as unknown as Payout['seller'],
    amount: 1_000_000,
    currency: 'NGN',
    bankAccountNumber: '0123456789',
    bankCode: '058',
    provider: 'fake',
    providerReference: 'ref-1',
    idempotencyKey: 'key-1',
    status,
    createdAt,
    updatedAt,
  };
}

function buildIntent(
  status: PaymentIntentStatus,
  createdAt: Date,
  updatedAt: Date,
): PaymentIntent {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    escrowId: '11111111-1111-4111-8111-111111111111',
    escrow: null as unknown as PaymentIntent['escrow'],
    buyerId: '66666666-6666-4666-8666-666666666666',
    buyer: null as unknown as PaymentIntent['buyer'],
    amount: 5_000_000,
    currency: 'NGN',
    provider: 'fake',
    providerReference: 'intent-1',
    authorizationUrl: null,
    status,
    createdAt,
    updatedAt,
  };
}

function compute(input: Partial<Parameters<typeof computeRiskItems>[0]>) {
  return computeRiskItems(
    { escrows: [], payouts: [], intents: [], now: NOW, ...input },
    thresholds,
  );
}

describe('computeRiskItems escrow rules', () => {
  it('flags a funded escrow that has not shipped past the threshold', () => {
    const items = compute({
      escrows: [{ escrow: buildEscrow(EscrowState.FUNDED, hoursAgo(50)), terms: buildTerms() }],
    });

    expect(items).toHaveLength(1);
    expect(items[0].reason).toBe('FUNDED_NOT_SHIPPED');
    expect(items[0].overdueByHours).toBe(2);
    expect(items[0].amount).toEqual({ amount: 5_000_000, currency: 'NGN' });
  });

  it('leaves a funded escrow alone while it is still inside the threshold', () => {
    const items = compute({
      escrows: [{ escrow: buildEscrow(EscrowState.FUNDED, hoursAgo(47)), terms: buildTerms() }],
    });

    expect(items).toEqual([]);
  });

  it('flags a delivered escrow whose inspection window has elapsed without auto-release', () => {
    const escrow = buildEscrow(EscrowState.DELIVERED, hoursAgo(30), hoursAgo(30));
    const items = compute({ escrows: [{ escrow, terms: buildTerms(24) }] });

    expect(items).toHaveLength(1);
    expect(items[0].reason).toBe('INSPECTION_OVERDUE');
    expect(items[0].overdueByHours).toBe(6);
  });

  it('flags a resolved escrow that never settled', () => {
    const items = compute({
      escrows: [
        { escrow: buildEscrow(EscrowState.RESOLVED_REFUND, hoursAgo(4)), terms: buildTerms() },
      ],
    });

    expect(items).toHaveLength(1);
    expect(items[0].reason).toBe('RESOLUTION_NOT_SETTLED');
  });

  it('ignores escrows in healthy or terminal states', () => {
    const items = compute({
      escrows: [
        { escrow: buildEscrow(EscrowState.RELEASED, hoursAgo(500)), terms: buildTerms() },
        { escrow: buildEscrow(EscrowState.SHIPPED, hoursAgo(500)), terms: buildTerms() },
        { escrow: buildEscrow(EscrowState.CANCELLED, hoursAgo(500)), terms: buildTerms() },
      ],
    });

    expect(items).toEqual([]);
  });

  it('does not flag a delivered escrow that has no recorded delivery time', () => {
    const items = compute({
      escrows: [{ escrow: buildEscrow(EscrowState.DELIVERED, hoursAgo(300)), terms: buildTerms() }],
    });

    expect(items).toEqual([]);
  });
});

describe('computeRiskItems money rules', () => {
  it('flags a failed payout immediately', () => {
    const items = compute({
      payouts: [buildPayout(PayoutStatus.FAILED, hoursAgo(3), hoursAgo(2))],
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'PAYOUT', reason: 'PAYOUT_FAILED', escrowId: null });
  });

  it('flags a pending payout only once it is stale', () => {
    expect(compute({ payouts: [buildPayout(PayoutStatus.PENDING, hoursAgo(2), hoursAgo(2))] })).toEqual([]);

    const stale = compute({
      payouts: [buildPayout(PayoutStatus.PENDING, hoursAgo(30), hoursAgo(30))],
    });

    expect(stale).toHaveLength(1);
    expect(stale[0].reason).toBe('PAYOUT_STUCK');
    expect(stale[0].overdueByHours).toBe(6);
  });

  it('never flags a confirmed payout', () => {
    expect(
      compute({ payouts: [buildPayout(PayoutStatus.CONFIRMED, hoursAgo(500), hoursAgo(500))] }),
    ).toEqual([]);
  });

  it('flags a quarantined payment intent immediately and carries its escrow id', () => {
    const items = compute({
      intents: [buildIntent(PaymentIntentStatus.QUARANTINED, hoursAgo(2), hoursAgo(1))],
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: 'PAYMENT_INTENT',
      reason: 'PAYMENT_QUARANTINED',
      escrowId: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('flags a pending intent only once it is stale, and never a funded one', () => {
    expect(
      compute({ intents: [buildIntent(PaymentIntentStatus.PENDING, hoursAgo(1), hoursAgo(1))] }),
    ).toEqual([]);
    expect(
      compute({ intents: [buildIntent(PaymentIntentStatus.FUNDED, hoursAgo(500), hoursAgo(500))] }),
    ).toEqual([]);

    const stale = compute({
      intents: [buildIntent(PaymentIntentStatus.PENDING, hoursAgo(10), hoursAgo(10))],
    });

    expect(stale).toHaveLength(1);
    expect(stale[0].reason).toBe('PAYMENT_INTENT_STUCK');
  });
});

describe('computeRiskItems ordering', () => {
  it('puts the most overdue item first across all three kinds', () => {
    const items = compute({
      escrows: [{ escrow: buildEscrow(EscrowState.FUNDED, hoursAgo(50)), terms: buildTerms() }],
      payouts: [buildPayout(PayoutStatus.PENDING, hoursAgo(100), hoursAgo(100))],
      intents: [buildIntent(PaymentIntentStatus.PENDING, hoursAgo(10), hoursAgo(10))],
    });

    expect(items.map((item) => item.reason)).toEqual([
      'PAYOUT_STUCK',
      'PAYMENT_INTENT_STUCK',
      'FUNDED_NOT_SHIPPED',
    ]);
  });
});

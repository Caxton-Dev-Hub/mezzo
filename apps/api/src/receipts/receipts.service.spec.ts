import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { ReceiptsService } from './receipts.service';
import { ReceiptNotAvailableError } from './errors/receipt-not-available.error';
import { EscrowService } from '../escrow/escrow.service';
import { EscrowState } from '../escrow/entities/escrow-state.enum';
import { EscrowRole } from '../escrow/entities/escrow-role.enum';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/entities/user-role.enum';
import { UserStatus } from '../users/entities/user-status.enum';
import { KycTier } from '../kyc/entities/kyc-tier.enum';
import { Escrow } from '../database/entities/escrow.entity';
import { EscrowTerms } from '../database/entities/escrow-terms.entity';
import { EscrowParty } from '../database/entities/escrow-party.entity';
import { EscrowEvent } from '../database/entities/escrow-event.entity';
import { PaymentIntent } from '../database/entities/payment-intent.entity';
import { User } from '../database/entities/user.entity';

const BUYER_ID = 'buyer-1';
const SELLER_ID = 'seller-1';
const ESCROW_ID = 'escrow-1';

function buildEscrow(): Escrow {
  return {
    id: ESCROW_ID,
    code: 'ESC-000001',
    state: EscrowState.FUNDED,
    version: 1,
    trackingReference: null,
    deliveredAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

function buildTerms(): EscrowTerms {
  return {
    id: randomUUID(),
    escrowId: ESCROW_ID,
    priceAmount: 1_000_000,
    priceCurrency: 'NGN',
    inspectionWindowHours: 48,
    deliveryMethod: 'courier',
    itemDescription: 'A vintage camera',
    feeBps: 250,
    requiresVerification: false,
    agreementText: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as EscrowTerms;
}

function buildParties(): EscrowParty[] {
  return [
    {
      id: randomUUID(),
      escrowId: ESCROW_ID,
      userId: BUYER_ID,
      role: EscrowRole.BUYER,
      termsAcceptedAt: new Date(),
      createdAt: new Date(),
    } as EscrowParty,
    {
      id: randomUUID(),
      escrowId: ESCROW_ID,
      userId: SELLER_ID,
      role: EscrowRole.SELLER,
      termsAcceptedAt: new Date(),
      createdAt: new Date(),
    } as EscrowParty,
  ];
}

function buildUser(id: string, email: string): User {
  return {
    id,
    email,
    passwordHash: 'irrelevant',
    googleSub: null,
    phone: null,
    role: UserRole.USER,
    status: UserStatus.ACTIVE,
    kycTier: KycTier.TIER_0,
    businessName: null,
    bio: null,
    location: null,
    avatarKey: null,
    emailVerifiedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function buildEvent(toState: EscrowState, createdAt: Date): EscrowEvent {
  return {
    id: randomUUID(),
    escrowId: ESCROW_ID,
    actorId: null,
    fromState: EscrowState.AGREED,
    toState,
    reason: null,
    correlationId: randomUUID(),
    createdAt,
  } as EscrowEvent;
}

function buildHarness(events: EscrowEvent[]): {
  service: ReceiptsService;
  assertIsParty: jest.Mock;
} {
  const assertIsParty = jest.fn(() => Promise.resolve(undefined));
  const escrowService = {
    assertIsParty,
    getDetail: jest.fn(() =>
      Promise.resolve({ escrow: buildEscrow(), terms: buildTerms(), parties: buildParties() }),
    ),
    getEvents: jest.fn(() => Promise.resolve(events)),
  } as unknown as EscrowService;

  const usersService = {
    findById: jest.fn((id: string) =>
      Promise.resolve(
        id === BUYER_ID
          ? buildUser(BUYER_ID, 'buyer@example.com')
          : buildUser(SELLER_ID, 'seller@example.com'),
      ),
    ),
  } as unknown as UsersService;

  const paymentIntents = {
    findOne: jest.fn(() => Promise.resolve({ providerReference: 'paystack-ref-1' })),
  } as unknown as Repository<PaymentIntent>;

  const service = new ReceiptsService(paymentIntents, escrowService, usersService);
  return { service, assertIsParty };
}

describe('ReceiptsService', () => {
  it('throws ReceiptNotAvailableError when the escrow was never funded', async () => {
    const { service } = buildHarness([]);

    await expect(service.getReceipt(ESCROW_ID, BUYER_ID)).rejects.toBeInstanceOf(
      ReceiptNotAvailableError,
    );
  });

  it('builds a receipt with the fee split and funded/released timestamps once funded', async () => {
    const fundedAt = new Date('2026-01-02T00:00:00Z');
    const releasedAt = new Date('2026-01-05T00:00:00Z');
    const { service } = buildHarness([
      buildEvent(EscrowState.FUNDED, fundedAt),
      buildEvent(EscrowState.RELEASED, releasedAt),
    ]);

    const receipt = await service.getReceipt(ESCROW_ID, BUYER_ID);

    expect(receipt.price).toEqual({ amount: 1_000_000, currency: 'NGN' });
    expect(receipt.feeAmount).toEqual({ amount: 25_000, currency: 'NGN' });
    expect(receipt.netAmount).toEqual({ amount: 975_000, currency: 'NGN' });
    expect(receipt.buyerEmail).toBe('buyer@example.com');
    expect(receipt.sellerEmail).toBe('seller@example.com');
    expect(receipt.fundedAt).toEqual(fundedAt);
    expect(receipt.releasedAt).toEqual(releasedAt);
    expect(receipt.paymentReference).toBe('paystack-ref-1');
  });

  it('leaves releasedAt null when the escrow has not been released yet', async () => {
    const fundedAt = new Date('2026-01-02T00:00:00Z');
    const { service } = buildHarness([buildEvent(EscrowState.FUNDED, fundedAt)]);

    const receipt = await service.getReceipt(ESCROW_ID, BUYER_ID);

    expect(receipt.releasedAt).toBeNull();
  });

  it('asserts the requester is a party before building the receipt', async () => {
    const { service, assertIsParty } = buildHarness([buildEvent(EscrowState.FUNDED, new Date())]);

    await service.getReceipt(ESCROW_ID, BUYER_ID);

    expect(assertIsParty).toHaveBeenCalledWith(ESCROW_ID, BUYER_ID);
  });
});

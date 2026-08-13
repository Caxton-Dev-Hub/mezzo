import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Queue } from 'bullmq';
import { DisputeService } from './dispute.service';
import { DisputeState } from './entities/dispute-state.enum';
import { DisputeReasonCode } from './entities/dispute-reason-code.enum';
import { DisputeResolutionOutcome } from './entities/dispute-resolution-outcome.enum';
import { DisputeStateMachine } from './dispute-state-machine';
import { MissingDisputeEvidenceError } from './errors/missing-dispute-evidence.error';
import { IllegalDisputeTransitionError } from './errors/illegal-dispute-transition.error';
import { StaleDisputeVersionError } from './errors/stale-dispute-version.error';
import { UnknownArbitrationRecordError } from './errors/unknown-arbitration-record.error';
import { disputeEvidenceWindowJobId } from './dispute-evidence-window-queue.constants';
import { Dispute } from '../database/entities/dispute.entity';
import { DisputeEvent } from '../database/entities/dispute-event.entity';
import { EscrowEvent } from '../database/entities/escrow-event.entity';
import { EvidenceItem } from '../database/entities/evidence-item.entity';
import { EvidenceFlag } from '../database/entities/evidence-flag.entity';
import { ArbitrationRecord } from '../database/entities/arbitration-record.entity';
import { EscrowService } from '../escrow/escrow.service';
import { EscrowStateMachine } from '../escrow/escrow-state-machine';
import { EscrowState } from '../escrow/entities/escrow-state.enum';
import { EscrowRole } from '../escrow/entities/escrow-role.enum';
import { OnlyBuyerMayActError } from '../escrow/errors/only-buyer-may-act.error';
import { NotEscrowPartyError } from '../escrow/errors/not-escrow-party.error';
import { EvidencePhase } from '../evidence/entities/evidence-phase.enum';
import { ChatService } from '../chat/chat.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationEventType } from '../notifications/entities/notification-event-type.enum';
import { LedgerService, PostingLine } from '../ledger/ledger.service';
import { EntryDirection } from '../ledger/entities/entry-direction.enum';
import { Money } from '../common/money/money';
import { escrowHoldingRef, platformFeeRevenueRef, userWalletRef } from '../ledger/account-refs';
import { RequestContextService } from '../common/context/request-context';
import { AuditService } from '../audit/audit.service';
import { MetricsService } from '../observability/metrics.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { UserRole } from '../users/entities/user-role.enum';
import { callArg, callArgs } from '../../test/support/mock-calls';

const ESCROW_ID = 'escrow-1';
const DISPUTE_ID = 'dispute-1';
const BUYER_ID = 'buyer-1';
const SELLER_ID = 'seller-1';
const ARBITER_ID = 'arbiter-1';
const WINDOW_HOURS = 48;

function buildDispute(overrides: Partial<Dispute> = {}): Dispute {
  return {
    id: DISPUTE_ID,
    escrowId: ESCROW_ID,
    escrow: undefined as never,
    raisedByUserId: BUYER_ID,
    reasonCode: DisputeReasonCode.NOT_AS_DESCRIBED,
    statement: 'The item is not what was advertised.',
    state: DisputeState.UNDER_REVIEW,
    version: 3,
    evidenceWindowExpiresAt: new Date('2026-01-01T00:00:00.000Z'),
    resolvedOutcome: null,
    resolvedByUserId: null,
    resolvedAt: null,
    resolvedSellerAmount: null,
    resolvedBuyerAmount: null,
    resolvedFeeAmount: null,
    resolvedCurrency: null,
    resolvedArbitrationRecordId: null,
    createdAt: new Date('2025-12-01T00:00:00.000Z'),
    updatedAt: new Date('2025-12-01T00:00:00.000Z'),
    ...overrides,
  };
}

function buildTerms(overrides: Record<string, unknown> = {}) {
  return {
    id: 'terms-1',
    escrowId: ESCROW_ID,
    priceAmount: 100_000,
    priceCurrency: 'NGN',
    inspectionWindowHours: 72,
    deliveryMethod: 'Courier',
    itemDescription: 'A used camera lens',
    feeBps: 250,
    requiresVerification: false,
    agreementText: 'Standard agreement',
    ...overrides,
  };
}

function buildParties() {
  return [
    { escrowId: ESCROW_ID, userId: BUYER_ID, role: EscrowRole.BUYER },
    { escrowId: ESCROW_ID, userId: SELLER_ID, role: EscrowRole.SELLER },
  ];
}

function buildEvidenceItem(overrides: Partial<EvidenceItem> = {}): EvidenceItem {
  return {
    id: randomUUID(),
    escrowId: ESCROW_ID,
    escrow: undefined as never,
    uploaderId: BUYER_ID,
    uploader: undefined as never,
    phase: EvidencePhase.AT_DELIVERY,
    storageKey: 'evidence/one.jpg',
    contentHash: 'a'.repeat(64),
    declaredMime: 'image/jpeg',
    detectedMime: 'image/jpeg',
    sizeBytes: 1_024,
    width: 100,
    height: 100,
    capturedAt: null,
    deviceMake: null,
    deviceModel: null,
    gpsLatitude: null,
    gpsLongitude: null,
    createdAt: new Date('2025-12-02T00:00:00.000Z'),
    ...overrides,
  };
}

interface Harness {
  service: DisputeService;
  disputesFindOne: jest.Mock;
  disputesFind: jest.Mock;
  evidenceCount: jest.Mock;
  evidenceFind: jest.Mock;
  flagsFind: jest.Mock;
  escrowEventsFind: jest.Mock;
  disputeEventsFind: jest.Mock;
  arbitrationFindOne: jest.Mock;
  getDetail: jest.Mock;
  assertIsParty: jest.Mock;
  escrowTransition: jest.Mock;
  disputeTransition: jest.Mock;
  disputeTransitionIdempotent: jest.Mock;
  postTransaction: jest.Mock;
  notify: jest.Mock;
  auditRecord: jest.Mock;
  incrementDisputeRaised: jest.Mock;
  queueAdd: jest.Mock;
  managerUpdate: jest.Mock;
  managerSave: jest.Mock;
  getTranscript: jest.Mock;
}

function buildHarness(
  options: {
    dispute?: Dispute | null;
    terms?: Record<string, unknown> | null;
    parties?: ReturnType<typeof buildParties>;
    evidenceCount?: number;
    evidenceItems?: EvidenceItem[];
    arbitrationRecord?: Partial<ArbitrationRecord> | null;
  } = {},
): Harness {
  const disputesFindOne = jest
    .fn()
    .mockResolvedValue(options.dispute === undefined ? buildDispute() : options.dispute);
  const disputesFind = jest.fn().mockResolvedValue([]);
  const disputes = {
    findOne: disputesFindOne,
    find: disputesFind,
  } as unknown as Repository<Dispute>;

  const disputeEventsFind = jest.fn().mockResolvedValue([]);
  const disputeEvents = { find: disputeEventsFind } as unknown as Repository<DisputeEvent>;

  const escrowEventsFind = jest.fn().mockResolvedValue([]);
  const escrowEvents = { find: escrowEventsFind } as unknown as Repository<EscrowEvent>;

  const evidenceCount = jest.fn().mockResolvedValue(options.evidenceCount ?? 1);
  const evidenceFind = jest.fn().mockResolvedValue(options.evidenceItems ?? []);
  const evidenceItems = {
    count: evidenceCount,
    find: evidenceFind,
  } as unknown as Repository<EvidenceItem>;

  const flagsFind = jest.fn().mockResolvedValue([]);
  const evidenceFlags = { find: flagsFind } as unknown as Repository<EvidenceFlag>;

  const arbitrationFindOne = jest
    .fn()
    .mockResolvedValue(options.arbitrationRecord === undefined ? null : options.arbitrationRecord);
  const arbitrationRecords = {
    findOne: arbitrationFindOne,
  } as unknown as Repository<ArbitrationRecord>;

  const managerSave = jest.fn().mockImplementation((_entity, row) => Promise.resolve({ ...row, id: DISPUTE_ID }));
  const managerUpdate = jest.fn().mockResolvedValue({ affected: 1 });
  const manager = {
    create: (_entity: unknown, row: Record<string, unknown>) => row,
    save: managerSave,
    update: managerUpdate,
  } as unknown as EntityManager;
  const dataSource = {
    transaction: jest.fn().mockImplementation((cb: (m: EntityManager) => Promise<unknown>) => cb(manager)),
  } as unknown as DataSource;

  const getDetail = jest.fn().mockResolvedValue({
    escrow: { id: ESCROW_ID, state: EscrowState.DISPUTED, version: 5 },
    terms: options.terms === undefined ? buildTerms() : options.terms,
    parties: options.parties ?? buildParties(),
  });
  const assertIsParty = jest.fn().mockResolvedValue(undefined);
  const escrowService = { getDetail, assertIsParty } as unknown as EscrowService;

  const escrowTransition = jest
    .fn()
    .mockResolvedValue({ id: ESCROW_ID, state: EscrowState.DISPUTED, version: 6 });
  const escrowStateMachine = { transition: escrowTransition } as unknown as EscrowStateMachine;

  const disputeTransition = jest
    .fn()
    .mockImplementation((id: string, to: DisputeState) =>
      Promise.resolve(buildDispute({ id, state: to, version: 4 })),
    );
  const disputeTransitionIdempotent = jest
    .fn()
    .mockImplementation((id: string, to: DisputeState) =>
      Promise.resolve(buildDispute({ id, state: to })),
    );
  const disputeStateMachine = {
    transition: disputeTransition,
    transitionIdempotent: disputeTransitionIdempotent,
  } as unknown as DisputeStateMachine;

  const postTransaction = jest.fn().mockResolvedValue(undefined);
  const ledgerService = { postTransaction } as unknown as LedgerService;

  const configService = {
    getOrThrow: jest.fn().mockReturnValue(WINDOW_HOURS),
  } as unknown as ConfigService;

  const getTranscript = jest.fn().mockResolvedValue([]);
  const chatService = { getTranscript } as unknown as ChatService;

  const notify = jest.fn().mockResolvedValue(undefined);
  const notificationsService = { notify } as unknown as NotificationsService;

  const requestContext = {
    correlationId: jest.fn().mockReturnValue('corr-1'),
  } as unknown as RequestContextService;

  const auditRecord = jest.fn().mockResolvedValue(undefined);
  const auditService = { record: auditRecord } as unknown as AuditService;

  const incrementDisputeRaised = jest.fn();
  const metricsService = { incrementDisputeRaised } as unknown as MetricsService;

  const queueAdd = jest.fn().mockResolvedValue(undefined);
  const evidenceWindowQueue = { add: queueAdd } as unknown as Queue;

  const service = new DisputeService(
    disputes,
    disputeEvents,
    escrowEvents,
    evidenceItems,
    evidenceFlags,
    arbitrationRecords,
    dataSource,
    escrowService,
    escrowStateMachine,
    disputeStateMachine,
    ledgerService,
    configService,
    chatService,
    notificationsService,
    requestContext,
    auditService,
    metricsService,
    evidenceWindowQueue,
  );

  return {
    service,
    disputesFindOne,
    disputesFind,
    evidenceCount,
    evidenceFind,
    flagsFind,
    escrowEventsFind,
    disputeEventsFind,
    arbitrationFindOne,
    getDetail,
    assertIsParty,
    escrowTransition,
    disputeTransition,
    disputeTransitionIdempotent,
    postTransaction,
    notify,
    auditRecord,
    incrementDisputeRaised,
    queueAdd,
    managerUpdate,
    managerSave,
    getTranscript,
  };
}

function sumByDirection(lines: PostingLine[], direction: EntryDirection): number {
  return lines
    .filter((line) => line.direction === direction)
    .reduce((total, line) => total + line.money.amount, 0);
}

describe('DisputeService.raise', () => {
  const dto = { reasonCode: DisputeReasonCode.NOT_AS_DESCRIBED, statement: 'Broken on arrival.' };

  it('rejects a seller trying to raise a dispute before touching the escrow state', async () => {
    const harness = buildHarness();

    await expect(harness.service.raise(ESCROW_ID, SELLER_ID, dto)).rejects.toBeInstanceOf(
      OnlyBuyerMayActError,
    );

    expect(harness.escrowTransition).not.toHaveBeenCalled();
    expect(harness.queueAdd).not.toHaveBeenCalled();
  });

  it('rejects a dispute raised without any at-delivery evidence from the buyer', async () => {
    const harness = buildHarness({ evidenceCount: 0 });

    await expect(harness.service.raise(ESCROW_ID, BUYER_ID, dto)).rejects.toBeInstanceOf(
      MissingDisputeEvidenceError,
    );

    expect(harness.evidenceCount).toHaveBeenCalledWith({
      where: { escrowId: ESCROW_ID, phase: EvidencePhase.AT_DELIVERY, uploaderId: BUYER_ID },
    });
    expect(harness.escrowTransition).not.toHaveBeenCalled();
  });

  it('moves the escrow to DISPUTED and opens the evidence window', async () => {
    const harness = buildHarness();

    const dispute = await harness.service.raise(ESCROW_ID, BUYER_ID, dto);

    expect(harness.escrowTransition).toHaveBeenCalledWith(
      ESCROW_ID,
      EscrowState.DISPUTED,
      expect.objectContaining({ actorId: BUYER_ID }),
      expect.anything(),
    );
    expect(harness.disputeTransition).toHaveBeenCalledWith(
      DISPUTE_ID,
      DisputeState.EVIDENCE,
      expect.objectContaining({ actorId: BUYER_ID }),
      expect.anything(),
    );
    expect(dispute.state).toBe(DisputeState.EVIDENCE);
  });

  it('schedules the auto-close job with a deterministic id delayed by the configured window', async () => {
    const harness = buildHarness();

    await harness.service.raise(ESCROW_ID, BUYER_ID, dto);

    expect(harness.queueAdd).toHaveBeenCalledWith(
      expect.any(String) as string,
      { disputeId: DISPUTE_ID },
      { jobId: disputeEvidenceWindowJobId(DISPUTE_ID), delay: WINDOW_HOURS * 60 * 60 * 1000 },
    );
  });

  it('notifies both parties and records the dispute metric', async () => {
    const harness = buildHarness();

    await harness.service.raise(ESCROW_ID, BUYER_ID, dto);

    expect(harness.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        escrowId: ESCROW_ID,
        eventType: NotificationEventType.DISPUTED,
        recipientUserIds: [BUYER_ID, SELLER_ID],
      }),
    );
    expect(harness.incrementDisputeRaised).toHaveBeenCalledTimes(1);
  });

  it('persists the buyer statement and reason code on the new dispute', async () => {
    const harness = buildHarness();

    await harness.service.raise(ESCROW_ID, BUYER_ID, dto);

    expect(harness.managerSave).toHaveBeenCalledWith(
      Dispute,
      expect.objectContaining({
        escrowId: ESCROW_ID,
        raisedByUserId: BUYER_ID,
        reasonCode: DisputeReasonCode.NOT_AS_DESCRIBED,
        statement: 'Broken on arrival.',
      }),
    );
  });
});

describe('DisputeService.listByEscrow', () => {
  it('requires a plain user to be a party to the escrow', async () => {
    const harness = buildHarness();
    const user: AuthenticatedUser = { id: BUYER_ID, role: UserRole.USER };

    await harness.service.listByEscrow(ESCROW_ID, user);

    expect(harness.assertIsParty).toHaveBeenCalledWith(ESCROW_ID, BUYER_ID);
  });

  it('lets an arbiter read disputes without being a party', async () => {
    const harness = buildHarness();
    const user: AuthenticatedUser = { id: ARBITER_ID, role: UserRole.ARBITER };

    await harness.service.listByEscrow(ESCROW_ID, user);

    expect(harness.assertIsParty).not.toHaveBeenCalled();
  });

  it('lets an admin read disputes without being a party', async () => {
    const harness = buildHarness();
    const user: AuthenticatedUser = { id: 'admin-1', role: UserRole.ADMIN };

    await harness.service.listByEscrow(ESCROW_ID, user);

    expect(harness.assertIsParty).not.toHaveBeenCalled();
  });
});

describe('DisputeService.listByState', () => {
  it('filters by state when one is supplied', async () => {
    const harness = buildHarness();

    await harness.service.listByState(DisputeState.UNDER_REVIEW);

    expect(harness.disputesFind).toHaveBeenCalledWith({
      where: { state: DisputeState.UNDER_REVIEW },
      order: { createdAt: 'DESC' },
    });
  });

  it('returns every dispute when no state is supplied', async () => {
    const harness = buildHarness();

    await harness.service.listByState();

    expect(harness.disputesFind).toHaveBeenCalledWith({ where: {}, order: { createdAt: 'DESC' } });
  });
});

describe('DisputeService.closeEvidenceWindow', () => {
  it('moves the dispute to UNDER_REVIEW idempotently', async () => {
    const harness = buildHarness();

    const dispute = await harness.service.closeEvidenceWindow(DISPUTE_ID, ARBITER_ID);

    expect(harness.disputeTransitionIdempotent).toHaveBeenCalledWith(
      DISPUTE_ID,
      DisputeState.UNDER_REVIEW,
      { actorId: ARBITER_ID, reason: 'Evidence window closed' },
    );
    expect(dispute.state).toBe(DisputeState.UNDER_REVIEW);
  });
});

describe('DisputeService.autoCloseEvidenceWindow', () => {
  it('swallows an illegal transition when the dispute already moved on', async () => {
    const harness = buildHarness();
    harness.disputeTransitionIdempotent.mockRejectedValue(
      new IllegalDisputeTransitionError(DisputeState.RESOLVED, DisputeState.UNDER_REVIEW),
    );

    await expect(harness.service.autoCloseEvidenceWindow(DISPUTE_ID)).resolves.toBeUndefined();
  });

  it('swallows a stale version error from a concurrent close', async () => {
    const harness = buildHarness();
    harness.disputeTransitionIdempotent.mockRejectedValue(new StaleDisputeVersionError());

    await expect(harness.service.autoCloseEvidenceWindow(DISPUTE_ID)).resolves.toBeUndefined();
  });

  it('rethrows unexpected failures so the job retries', async () => {
    const harness = buildHarness();
    harness.disputeTransitionIdempotent.mockRejectedValue(new Error('connection lost'));

    await expect(harness.service.autoCloseEvidenceWindow(DISPUTE_ID)).rejects.toThrow('connection lost');
  });

  it('passes a null actor so the event records an automated close', async () => {
    const harness = buildHarness();

    await harness.service.autoCloseEvidenceWindow(DISPUTE_ID);

    expect(harness.disputeTransitionIdempotent).toHaveBeenCalledWith(
      DISPUTE_ID,
      DisputeState.UNDER_REVIEW,
      { actorId: null, reason: 'Evidence window closed' },
    );
  });
});

describe('DisputeService.resolve', () => {
  const releaseDto = { outcome: DisputeResolutionOutcome.RELEASE_TO_SELLER };

  it('throws NotFoundException for an unknown dispute', async () => {
    const harness = buildHarness({ dispute: null });

    await expect(harness.service.resolve(DISPUTE_ID, ARBITER_ID, releaseDto)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns an already-resolved dispute without posting to the ledger again', async () => {
    const resolved = buildDispute({ state: DisputeState.RESOLVED });
    const harness = buildHarness({ dispute: resolved });

    const result = await harness.service.resolve(DISPUTE_ID, ARBITER_ID, releaseDto);

    expect(result).toBe(resolved);
    expect(harness.postTransaction).not.toHaveBeenCalled();
    expect(harness.disputeTransition).not.toHaveBeenCalled();
  });

  it('rejects an arbitration record belonging to a different dispute', async () => {
    const harness = buildHarness({
      arbitrationRecord: { id: 'rec-1', disputeId: 'another-dispute' },
    });

    await expect(
      harness.service.resolve(DISPUTE_ID, ARBITER_ID, { ...releaseDto, arbitrationRecordId: 'rec-1' }),
    ).rejects.toBeInstanceOf(UnknownArbitrationRecordError);

    expect(harness.postTransaction).not.toHaveBeenCalled();
  });

  it('rejects an arbitration record that does not exist', async () => {
    const harness = buildHarness({ arbitrationRecord: null });

    await expect(
      harness.service.resolve(DISPUTE_ID, ARBITER_ID, { ...releaseDto, arbitrationRecordId: 'rec-1' }),
    ).rejects.toBeInstanceOf(UnknownArbitrationRecordError);
  });

  it('throws NotFoundException when the escrow has no frozen terms', async () => {
    const harness = buildHarness({ terms: null });

    await expect(harness.service.resolve(DISPUTE_ID, ARBITER_ID, releaseDto)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws NotFoundException when a counterparty is missing', async () => {
    const harness = buildHarness({
      parties: [{ escrowId: ESCROW_ID, userId: BUYER_ID, role: EscrowRole.BUYER }],
    });

    await expect(harness.service.resolve(DISPUTE_ID, ARBITER_ID, releaseDto)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('posts a balanced release: seller net and platform fee credited against the escrow holding', async () => {
    const harness = buildHarness();

    await harness.service.resolve(DISPUTE_ID, ARBITER_ID, releaseDto);

    const lines = callArg<PostingLine[]>(harness.postTransaction, 0, 0);
    expect(sumByDirection(lines, EntryDirection.DEBIT)).toBe(100_000);
    expect(sumByDirection(lines, EntryDirection.CREDIT)).toBe(100_000);
    expect(lines).toEqual([
      expect.objectContaining({
        accountRef: escrowHoldingRef(ESCROW_ID),
        direction: EntryDirection.DEBIT,
        money: expect.objectContaining({ amount: 100_000, currency: 'NGN' }) as Money,
      }),
      expect.objectContaining({
        accountRef: userWalletRef(SELLER_ID),
        direction: EntryDirection.CREDIT,
        money: expect.objectContaining({ amount: 97_500 }) as Money,
      }),
      expect.objectContaining({
        accountRef: platformFeeRevenueRef(),
        direction: EntryDirection.CREDIT,
        money: expect.objectContaining({ amount: 2_500 }) as Money,
      }),
    ]);
  });

  it('posts a full refund to the buyer with no seller or fee line', async () => {
    const harness = buildHarness();

    await harness.service.resolve(DISPUTE_ID, ARBITER_ID, {
      outcome: DisputeResolutionOutcome.REFUND_TO_BUYER,
    });

    const lines = callArg<PostingLine[]>(harness.postTransaction, 0, 0);
    expect(sumByDirection(lines, EntryDirection.DEBIT)).toBe(100_000);
    expect(sumByDirection(lines, EntryDirection.CREDIT)).toBe(100_000);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toEqual(
      expect.objectContaining({
        accountRef: userWalletRef(BUYER_ID),
        direction: EntryDirection.CREDIT,
        money: expect.objectContaining({ amount: 100_000 }) as Money,
      }),
    );
  });

  it('splits a partial outcome between both wallets and the fee account, still balanced', async () => {
    const harness = buildHarness();

    await harness.service.resolve(DISPUTE_ID, ARBITER_ID, {
      outcome: DisputeResolutionOutcome.SPLIT,
      splitSellerBps: 6_000,
    });

    const lines = callArg<PostingLine[]>(harness.postTransaction, 0, 0);
    expect(sumByDirection(lines, EntryDirection.DEBIT)).toBe(100_000);
    expect(sumByDirection(lines, EntryDirection.CREDIT)).toBe(100_000);
    expect(lines).toEqual([
      expect.objectContaining({ accountRef: escrowHoldingRef(ESCROW_ID) }),
      expect.objectContaining({
        accountRef: userWalletRef(SELLER_ID),
        money: expect.objectContaining({ amount: 58_500 }) as Money,
      }),
      expect.objectContaining({
        accountRef: platformFeeRevenueRef(),
        money: expect.objectContaining({ amount: 1_500 }) as Money,
      }),
      expect.objectContaining({
        accountRef: userWalletRef(BUYER_ID),
        money: expect.objectContaining({ amount: 40_000 }) as Money,
      }),
    ]);
  });

  it('walks the escrow through the intermediate and terminal release states in order', async () => {
    const harness = buildHarness();

    await harness.service.resolve(DISPUTE_ID, ARBITER_ID, releaseDto);

    expect(callArgs(harness.escrowTransition).map((call) => call[1])).toEqual([
      EscrowState.RESOLVED_RELEASE,
      EscrowState.RELEASED,
    ]);
  });

  it('walks the escrow through the refund states for a buyer refund', async () => {
    const harness = buildHarness();

    await harness.service.resolve(DISPUTE_ID, ARBITER_ID, {
      outcome: DisputeResolutionOutcome.REFUND_TO_BUYER,
    });

    expect(callArgs(harness.escrowTransition).map((call) => call[1])).toEqual([
      EscrowState.RESOLVED_REFUND,
      EscrowState.REFUNDED,
    ]);
  });

  it('keys the ledger posting to the dispute so a retry cannot double-pay', async () => {
    const harness = buildHarness();

    await harness.service.resolve(DISPUTE_ID, ARBITER_ID, releaseDto);

    expect(callArg(harness.postTransaction, 0, 1)).toEqual(
      expect.objectContaining({ idempotencyKey: `dispute-resolve:${DISPUTE_ID}` }),
    );
  });

  it('shares one correlation id across the transition, posting, notification, and audit trail', async () => {
    const harness = buildHarness();

    await harness.service.resolve(DISPUTE_ID, ARBITER_ID, releaseDto);

    expect(callArg(harness.disputeTransition, 0, 2)).toEqual(
      expect.objectContaining({ correlationId: 'corr-1' }),
    );
    expect(callArg(harness.postTransaction, 0, 1)).toEqual(
      expect.objectContaining({ correlationId: 'corr-1' }),
    );
    expect(callArg(harness.notify, 0, 0)).toEqual(
      expect.objectContaining({ correlationId: 'corr-1' }),
    );
    expect(callArg(harness.auditRecord, 0, 0)).toEqual(
      expect.objectContaining({ correlationId: 'corr-1' }),
    );
  });

  it('writes the resolved split back onto the dispute row', async () => {
    const harness = buildHarness();

    const resolved = await harness.service.resolve(DISPUTE_ID, ARBITER_ID, releaseDto);

    expect(harness.managerUpdate).toHaveBeenCalledWith(
      Dispute,
      { id: DISPUTE_ID },
      expect.objectContaining({
        resolvedOutcome: DisputeResolutionOutcome.RELEASE_TO_SELLER,
        resolvedByUserId: ARBITER_ID,
        resolvedSellerAmount: 97_500,
        resolvedBuyerAmount: 0,
        resolvedFeeAmount: 2_500,
        resolvedCurrency: 'NGN',
      }),
    );
    expect(resolved.resolvedSellerAmount).toBe(97_500);
    expect(resolved.resolvedFeeAmount).toBe(2_500);
  });

  it('records an audit entry naming the arbitration record it executed', async () => {
    const harness = buildHarness({
      arbitrationRecord: { id: 'rec-1', disputeId: DISPUTE_ID },
    });

    await harness.service.resolve(DISPUTE_ID, ARBITER_ID, {
      ...releaseDto,
      arbitrationRecordId: 'rec-1',
    });

    expect(harness.auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DISPUTE_RESOLUTION_EXECUTED',
        entityType: 'dispute',
        entityId: DISPUTE_ID,
        reason: 'Executed per ArbitrationRecord rec-1',
      }),
    );
  });

  it('records an audit entry flagging a manual resolution with no AI recommendation', async () => {
    const harness = buildHarness();

    await harness.service.resolve(DISPUTE_ID, ARBITER_ID, releaseDto);

    expect(harness.auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'Manual resolution without an AI recommendation' }),
    );
  });

  it('notifies both parties that the dispute is resolved', async () => {
    const harness = buildHarness();

    await harness.service.resolve(DISPUTE_ID, ARBITER_ID, releaseDto);

    expect(harness.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: NotificationEventType.RESOLVED,
        recipientUserIds: [BUYER_ID, SELLER_ID],
      }),
    );
  });
});

describe('DisputeService.getPacket', () => {
  const arbiter: AuthenticatedUser = { id: ARBITER_ID, role: UserRole.ARBITER };

  it('throws NotFoundException for an unknown dispute', async () => {
    const harness = buildHarness({ dispute: null });

    await expect(harness.service.getPacket(DISPUTE_ID, arbiter)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('refuses a stranger who is neither a party nor an arbiter', async () => {
    const harness = buildHarness();
    const stranger: AuthenticatedUser = { id: 'stranger-1', role: UserRole.USER };

    await expect(harness.service.getPacket(DISPUTE_ID, stranger)).rejects.toBeInstanceOf(
      NotEscrowPartyError,
    );
  });

  it('serves the packet to an arbiter who is not a party', async () => {
    const harness = buildHarness();

    const packet = await harness.service.getPacket(DISPUTE_ID, arbiter);

    expect(packet.dispute.id).toBe(DISPUTE_ID);
  });

  it('exposes the frozen terms the dispute must be judged against', async () => {
    const harness = buildHarness();

    const packet = await harness.service.getPacket(DISPUTE_ID, arbiter);

    expect(packet.frozenTerms).toEqual({
      price: { amount: 100_000, currency: 'NGN' },
      inspectionWindowHours: 72,
      deliveryMethod: 'Courier',
      itemDescription: 'A used camera lens',
      feeBps: 250,
      requiresVerification: false,
      agreementText: 'Standard agreement',
    });
  });

  it('separates creation evidence from each side of the delivery evidence', async () => {
    const harness = buildHarness({
      evidenceItems: [
        buildEvidenceItem({ id: 'c1', phase: EvidencePhase.AT_CREATION, uploaderId: SELLER_ID }),
        buildEvidenceItem({ id: 'b1', phase: EvidencePhase.AT_DELIVERY, uploaderId: BUYER_ID }),
        buildEvidenceItem({ id: 's1', phase: EvidencePhase.AT_DELIVERY, uploaderId: SELLER_ID }),
      ],
    });

    const packet = await harness.service.getPacket(DISPUTE_ID, arbiter);

    expect(packet.creationEvidence.map((item) => item.id)).toEqual(['c1']);
    expect(packet.buyerEvidence.map((item) => item.id)).toEqual(['b1']);
    expect(packet.sellerEvidence.map((item) => item.id)).toEqual(['s1']);
    expect(packet.submissionFlags.buyerSubmitted).toBe(true);
    expect(packet.submissionFlags.sellerSubmitted).toBe(true);
  });

  it('reports a one-sided submission when the seller never answered', async () => {
    const harness = buildHarness({
      evidenceItems: [buildEvidenceItem({ id: 'b1', uploaderId: BUYER_ID })],
    });

    const packet = await harness.service.getPacket(DISPUTE_ID, arbiter);

    expect(packet.submissionFlags.buyerSubmitted).toBe(true);
    expect(packet.submissionFlags.sellerSubmitted).toBe(false);
  });

  it('marks the evidence window elapsed once its deadline has passed', async () => {
    const harness = buildHarness({
      dispute: buildDispute({ evidenceWindowExpiresAt: new Date(Date.now() - 1_000) }),
    });

    const packet = await harness.service.getPacket(DISPUTE_ID, arbiter);

    expect(packet.submissionFlags.evidenceWindowElapsed).toBe(true);
  });

  it('marks the evidence window open while the deadline is still ahead', async () => {
    const harness = buildHarness({
      dispute: buildDispute({ evidenceWindowExpiresAt: new Date(Date.now() + 60_000) }),
    });

    const packet = await harness.service.getPacket(DISPUTE_ID, arbiter);

    expect(packet.submissionFlags.evidenceWindowElapsed).toBe(false);
  });

  it('skips the flag lookup entirely when the escrow has no evidence', async () => {
    const harness = buildHarness({ evidenceItems: [] });

    await harness.service.getPacket(DISPUTE_ID, arbiter);

    expect(harness.flagsFind).not.toHaveBeenCalled();
  });
});

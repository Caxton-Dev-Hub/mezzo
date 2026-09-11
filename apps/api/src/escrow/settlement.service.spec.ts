import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Queue } from 'bullmq';
import { SettlementService } from './settlement.service';
import { EscrowService } from './escrow.service';
import { EscrowStateMachine } from './escrow-state-machine';
import { EscrowState } from './entities/escrow-state.enum';
import { EscrowRole } from './entities/escrow-role.enum';
import { OnlySellerMayActError } from './errors/only-seller-may-act.error';
import { OnlyBuyerMayActError } from './errors/only-buyer-may-act.error';
import { IllegalTransitionError } from './errors/illegal-transition.error';
import { StaleEscrowVersionError } from './errors/stale-escrow-version.error';
import { autoReleaseJobId } from './auto-release-queue.constants';
import { inspectionEndingSoonJobId } from './inspection-ending-soon-queue.constants';
import { Escrow } from '../database/entities/escrow.entity';
import { LedgerService, PostingLine } from '../ledger/ledger.service';
import { EntryDirection } from '../ledger/entities/entry-direction.enum';
import { Money } from '../common/money/money';
import { escrowHoldingRef, platformFeeRevenueRef, userWalletRef } from '../ledger/account-refs';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationEventType } from '../notifications/entities/notification-event-type.enum';
import { MetricsService } from '../observability/metrics.service';
import { TracingService } from '../observability/tracing.service';
import { callArg } from '../../test/support/mock-calls';

const ESCROW_ID = 'escrow-1';
const BUYER_ID = 'buyer-1';
const SELLER_ID = 'seller-1';
const LEAD_HOURS = 6;

function buildTerms(overrides: Record<string, unknown> = {}) {
  return {
    id: 'terms-1',
    escrowId: ESCROW_ID,
    priceAmount: 100_000,
    priceCurrency: 'NGN',
    inspectionWindowHours: 72,
    feeBps: 250,
    ...overrides,
  };
}

function buildParties() {
  return [
    { escrowId: ESCROW_ID, userId: BUYER_ID, role: EscrowRole.BUYER },
    { escrowId: ESCROW_ID, userId: SELLER_ID, role: EscrowRole.SELLER },
  ];
}

interface Harness {
  service: SettlementService;
  getDetail: jest.Mock;
  transition: jest.Mock;
  postTransaction: jest.Mock;
  notify: jest.Mock;
  escrowsUpdate: jest.Mock;
  autoReleaseAdd: jest.Mock;
  inspectionAdd: jest.Mock;
  incrementAutoRelease: jest.Mock;
  withSpan: jest.Mock;
  configService: { getOrThrow: jest.Mock };
}

function buildHarness(
  options: {
    terms?: Record<string, unknown> | null;
    parties?: ReturnType<typeof buildParties>;
    escrowState?: EscrowState;
  } = {},
): Harness {
  const escrowsUpdate = jest.fn().mockResolvedValue({ affected: 1 });
  const escrows = { update: escrowsUpdate } as unknown as Repository<Escrow>;

  const manager = {} as unknown as EntityManager;
  const dataSource = {
    transaction: jest.fn().mockImplementation((cb: (m: EntityManager) => Promise<unknown>) => cb(manager)),
  } as unknown as DataSource;

  const getDetail = jest.fn().mockResolvedValue({
    escrow: { id: ESCROW_ID, state: options.escrowState ?? EscrowState.DELIVERED, version: 4 },
    terms: options.terms === undefined ? buildTerms() : options.terms,
    parties: options.parties ?? buildParties(),
  });
  const escrowService = { getDetail } as unknown as EscrowService;

  const transition = jest
    .fn()
    .mockImplementation((id: string, to: EscrowState) =>
      Promise.resolve({ id, state: to, version: 5 } as Escrow),
    );
  const stateMachine = { transition } as unknown as EscrowStateMachine;

  const postTransaction = jest.fn().mockResolvedValue(undefined);
  const ledgerService = { postTransaction } as unknown as LedgerService;

  const configService = {
    getOrThrow: jest.fn().mockReturnValue(LEAD_HOURS),
  } as unknown as ConfigService;

  const notify = jest.fn().mockResolvedValue(undefined);
  const notificationsService = { notify } as unknown as NotificationsService;

  const incrementAutoRelease = jest.fn();
  const metricsService = { incrementAutoRelease } as unknown as MetricsService;

  const withSpan = jest
    .fn()
    .mockImplementation((_name: string, fn: () => Promise<unknown>) => fn());
  const tracingService = { withSpan } as unknown as TracingService;

  const autoReleaseAdd = jest.fn().mockResolvedValue(undefined);
  const autoReleaseQueue = { add: autoReleaseAdd } as unknown as Queue;
  const inspectionAdd = jest.fn().mockResolvedValue(undefined);
  const inspectionEndingSoonQueue = { add: inspectionAdd } as unknown as Queue;

  const service = new SettlementService(
    escrows,
    dataSource,
    escrowService,
    stateMachine,
    ledgerService,
    configService,
    notificationsService,
    metricsService,
    tracingService,
    autoReleaseQueue,
    inspectionEndingSoonQueue,
  );

  return {
    service,
    getDetail,
    transition,
    postTransaction,
    notify,
    escrowsUpdate,
    autoReleaseAdd,
    inspectionAdd,
    incrementAutoRelease,
    withSpan,
    configService: configService as unknown as { getOrThrow: jest.Mock },
  };
}

function sumByDirection(lines: PostingLine[], direction: EntryDirection): number {
  return lines
    .filter((line) => line.direction === direction)
    .reduce((total, line) => total + line.money.amount, 0);
}

describe('SettlementService.ship', () => {
  it('refuses anyone but the seller', async () => {
    const harness = buildHarness();

    await expect(harness.service.ship(ESCROW_ID, BUYER_ID, {})).rejects.toBeInstanceOf(
      OnlySellerMayActError,
    );
    expect(harness.transition).not.toHaveBeenCalled();
  });

  it('moves the escrow to SHIPPED and notifies both parties', async () => {
    const harness = buildHarness();

    const escrow = await harness.service.ship(ESCROW_ID, SELLER_ID, {});

    expect(escrow.state).toBe(EscrowState.SHIPPED);
    expect(harness.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: NotificationEventType.SHIPPED,
        recipientUserIds: [BUYER_ID, SELLER_ID],
      }),
    );
  });

  it('stores a tracking reference when the seller supplies one', async () => {
    const harness = buildHarness();

    const escrow = await harness.service.ship(ESCROW_ID, SELLER_ID, { trackingReference: 'TRK-9' });

    expect(harness.escrowsUpdate).toHaveBeenCalledWith(
      { id: ESCROW_ID },
      { trackingReference: 'TRK-9' },
    );
    expect(escrow.trackingReference).toBe('TRK-9');
  });

  it('leaves the tracking reference untouched when none is supplied', async () => {
    const harness = buildHarness();

    await harness.service.ship(ESCROW_ID, SELLER_ID, {});

    expect(harness.escrowsUpdate).not.toHaveBeenCalled();
  });
});

describe('SettlementService.confirmDelivery', () => {
  it('refuses anyone but the buyer', async () => {
    const harness = buildHarness();

    await expect(harness.service.confirmDelivery(ESCROW_ID, SELLER_ID)).rejects.toBeInstanceOf(
      OnlyBuyerMayActError,
    );
    expect(harness.transition).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when the escrow has no frozen terms', async () => {
    const harness = buildHarness({ terms: null });

    await expect(harness.service.confirmDelivery(ESCROW_ID, BUYER_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('moves to DELIVERED and stamps the delivery time', async () => {
    const harness = buildHarness();

    const escrow = await harness.service.confirmDelivery(ESCROW_ID, BUYER_ID);

    expect(escrow.state).toBe(EscrowState.DELIVERED);
    expect(harness.escrowsUpdate).toHaveBeenCalledWith(
      { id: ESCROW_ID },
      { deliveredAt: expect.any(Date) as Date },
    );
    expect(escrow.deliveredAt).toBeInstanceOf(Date);
  });

  it('schedules the auto-release for the end of the inspection window', async () => {
    const harness = buildHarness();

    await harness.service.confirmDelivery(ESCROW_ID, BUYER_ID);

    expect(harness.autoReleaseAdd).toHaveBeenCalledWith(
      expect.any(String) as string,
      { escrowId: ESCROW_ID },
      { jobId: autoReleaseJobId(ESCROW_ID), delay: 72 * 60 * 60 * 1000 },
    );
  });

  it('fails fast instead of hanging forever when the queue never responds', async () => {
    const harness = buildHarness();
    harness.configService.getOrThrow.mockImplementation((key: string) =>
      key === 'QUEUE_ENQUEUE_TIMEOUT_MS' ? 10 : LEAD_HOURS,
    );
    harness.autoReleaseAdd.mockReturnValue(new Promise(() => {}));

    await expect(harness.service.confirmDelivery(ESCROW_ID, BUYER_ID)).rejects.toThrow(
      'timed out after 10ms',
    );
  });

  it('schedules the ending-soon nudge one lead time before auto-release', async () => {
    const harness = buildHarness();

    await harness.service.confirmDelivery(ESCROW_ID, BUYER_ID);

    const windowMs = 72 * 60 * 60 * 1000;
    expect(harness.inspectionAdd).toHaveBeenCalledWith(
      expect.any(String) as string,
      { escrowId: ESCROW_ID },
      {
        jobId: inspectionEndingSoonJobId(ESCROW_ID),
        delay: windowMs - LEAD_HOURS * 60 * 60 * 1000,
      },
    );
  });

  it('halves a short inspection window rather than nudging before delivery', async () => {
    const harness = buildHarness({ terms: buildTerms({ inspectionWindowHours: 2 }) });

    await harness.service.confirmDelivery(ESCROW_ID, BUYER_ID);

    const windowMs = 2 * 60 * 60 * 1000;
    expect(callArg<{ delay: number }>(harness.inspectionAdd, 0, 2).delay).toBe(windowMs - windowMs / 2);
  });

  it('notifies both parties that delivery is confirmed', async () => {
    const harness = buildHarness();

    await harness.service.confirmDelivery(ESCROW_ID, BUYER_ID);

    expect(harness.notify).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: NotificationEventType.DELIVERED }),
    );
  });
});

describe('SettlementService.notifyInspectionEndingSoon', () => {
  it('stays silent when the escrow has already left DELIVERED', async () => {
    const harness = buildHarness({ escrowState: EscrowState.RELEASED });

    await harness.service.notifyInspectionEndingSoon(ESCROW_ID);

    expect(harness.notify).not.toHaveBeenCalled();
  });

  it('nudges both parties while the escrow is still under inspection', async () => {
    const harness = buildHarness({ escrowState: EscrowState.DELIVERED });

    await harness.service.notifyInspectionEndingSoon(ESCROW_ID);

    expect(harness.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: NotificationEventType.INSPECTION_ENDING_SOON,
        recipientUserIds: [BUYER_ID, SELLER_ID],
      }),
    );
  });
});

describe('SettlementService.release', () => {
  it('refuses anyone but the buyer', async () => {
    const harness = buildHarness();

    await expect(harness.service.release(ESCROW_ID, SELLER_ID)).rejects.toBeInstanceOf(
      OnlyBuyerMayActError,
    );
    expect(harness.postTransaction).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when the escrow has no frozen terms', async () => {
    const harness = buildHarness({ terms: null });

    await expect(harness.service.release(ESCROW_ID, BUYER_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws NotFoundException when the seller party is missing', async () => {
    const harness = buildHarness({
      parties: [{ escrowId: ESCROW_ID, userId: BUYER_ID, role: EscrowRole.BUYER }],
    });

    await expect(harness.service.release(ESCROW_ID, BUYER_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('debits the holding account and credits the seller net of the platform fee', async () => {
    const harness = buildHarness();

    await harness.service.release(ESCROW_ID, BUYER_ID);

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
        accountRef: userWalletRef(SELLER_ID, 'NGN'),
        direction: EntryDirection.CREDIT,
        money: expect.objectContaining({ amount: 97_500 }) as Money,
      }),
      expect.objectContaining({
        accountRef: platformFeeRevenueRef('NGN'),
        direction: EntryDirection.CREDIT,
        money: expect.objectContaining({ amount: 2_500 }) as Money,
      }),
    ]);
  });

  it('rounds the fee down so the seller is never short-changed by a fraction', async () => {
    const harness = buildHarness({ terms: buildTerms({ priceAmount: 999, feeBps: 250 }) });

    await harness.service.release(ESCROW_ID, BUYER_ID);

    const lines = callArg<PostingLine[]>(harness.postTransaction, 0, 0);
    expect(lines[2].money.amount).toBe(24);
    expect(lines[1].money.amount).toBe(975);
    expect(sumByDirection(lines, EntryDirection.CREDIT)).toBe(999);
  });

  it('keys the release posting to the escrow so a retry cannot double-pay', async () => {
    const harness = buildHarness();

    await harness.service.release(ESCROW_ID, BUYER_ID);

    expect(callArg(harness.postTransaction, 0, 1)).toEqual(
      expect.objectContaining({ idempotencyKey: `release:${ESCROW_ID}` }),
    );
  });

  it('performs the transition and the posting inside one transaction', async () => {
    const harness = buildHarness();

    await harness.service.release(ESCROW_ID, BUYER_ID);

    expect(callArg(harness.transition, 0, 3)).toBe(callArg(harness.postTransaction, 0, 2));
  });

  it('traces the release as a single span', async () => {
    const harness = buildHarness();

    await harness.service.release(ESCROW_ID, BUYER_ID);

    expect(harness.withSpan).toHaveBeenCalledWith('settlement.release', expect.any(Function) as () => void);
  });

  it('notifies both parties once the funds have moved', async () => {
    const harness = buildHarness();

    await harness.service.release(ESCROW_ID, BUYER_ID);

    expect(harness.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: NotificationEventType.RELEASED,
        recipientUserIds: [BUYER_ID, SELLER_ID],
      }),
    );
  });
});

describe('SettlementService.adminRelease', () => {
  const ADMIN_ID = 'admin-1';

  it('releases funds when called by someone other than the buyer', async () => {
    const harness = buildHarness();

    await harness.service.adminRelease(ESCROW_ID, ADMIN_ID);

    const lines = callArg<PostingLine[]>(harness.postTransaction, 0, 0);
    expect(sumByDirection(lines, EntryDirection.CREDIT)).toBe(100_000);
  });

  it('still refuses to release from an illegal escrow state', async () => {
    const harness = buildHarness();
    harness.transition.mockRejectedValue(new Error('illegal transition'));

    await expect(harness.service.adminRelease(ESCROW_ID, ADMIN_ID)).rejects.toThrow(
      'illegal transition',
    );
  });
});

describe('SettlementService.autoRelease', () => {
  it('releases with a null actor and counts the automated release', async () => {
    const harness = buildHarness();

    await harness.service.autoRelease(ESCROW_ID);

    expect(callArg(harness.transition, 0, 2)).toEqual(
      expect.objectContaining({ actorId: null }),
    );
    expect(harness.incrementAutoRelease).toHaveBeenCalledTimes(1);
  });

  it('gives up quietly when the escrow already left the inspection window', async () => {
    const harness = buildHarness();
    harness.transition.mockRejectedValue(
      new IllegalTransitionError(EscrowState.RELEASED, EscrowState.RELEASED),
    );

    await expect(harness.service.autoRelease(ESCROW_ID)).resolves.toBeUndefined();
    expect(harness.incrementAutoRelease).not.toHaveBeenCalled();
  });

  it('gives up quietly when a concurrent release won the race', async () => {
    const harness = buildHarness();
    harness.transition.mockRejectedValue(new StaleEscrowVersionError());

    await expect(harness.service.autoRelease(ESCROW_ID)).resolves.toBeUndefined();
  });

  it('rethrows unexpected failures so the job retries', async () => {
    const harness = buildHarness();
    harness.transition.mockRejectedValue(new Error('connection lost'));

    await expect(harness.service.autoRelease(ESCROW_ID)).rejects.toThrow('connection lost');
  });
});

describe('SettlementService.dispute', () => {
  it('refuses anyone but the buyer', async () => {
    const harness = buildHarness();

    await expect(harness.service.dispute(ESCROW_ID, SELLER_ID)).rejects.toBeInstanceOf(
      OnlyBuyerMayActError,
    );
  });

  it('moves the escrow to DISPUTED without moving any money', async () => {
    const harness = buildHarness();

    const escrow = await harness.service.dispute(ESCROW_ID, BUYER_ID);

    expect(escrow.state).toBe(EscrowState.DISPUTED);
    expect(harness.postTransaction).not.toHaveBeenCalled();
  });
});

describe('SettlementService.refund', () => {
  it('throws NotFoundException when the escrow has no frozen terms', async () => {
    const harness = buildHarness({ terms: null });

    await expect(harness.service.refund(ESCROW_ID, BUYER_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws NotFoundException when the buyer party is missing', async () => {
    const harness = buildHarness({
      parties: [{ escrowId: ESCROW_ID, userId: SELLER_ID, role: EscrowRole.SELLER }],
    });

    await expect(harness.service.refund(ESCROW_ID, BUYER_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns the whole price to the buyer with no fee withheld', async () => {
    const harness = buildHarness();

    const escrow = await harness.service.refund(ESCROW_ID, BUYER_ID);

    expect(escrow.state).toBe(EscrowState.REFUNDED);
    const lines = callArg<PostingLine[]>(harness.postTransaction, 0, 0);
    expect(lines).toEqual([
      expect.objectContaining({
        accountRef: escrowHoldingRef(ESCROW_ID),
        direction: EntryDirection.DEBIT,
        money: expect.objectContaining({ amount: 100_000 }) as Money,
      }),
      expect.objectContaining({
        accountRef: userWalletRef(BUYER_ID, 'NGN'),
        direction: EntryDirection.CREDIT,
        money: expect.objectContaining({ amount: 100_000 }) as Money,
      }),
    ]);
    expect(sumByDirection(lines, EntryDirection.DEBIT)).toBe(
      sumByDirection(lines, EntryDirection.CREDIT),
    );
  });

  it('keys the refund posting to the escrow so a retry cannot double-refund', async () => {
    const harness = buildHarness();

    await harness.service.refund(ESCROW_ID, null);

    expect(callArg(harness.postTransaction, 0, 1)).toEqual(
      expect.objectContaining({ idempotencyKey: `refund:${ESCROW_ID}` }),
    );
  });

  it('traces the refund as a single span', async () => {
    const harness = buildHarness();

    await harness.service.refund(ESCROW_ID, BUYER_ID);

    expect(harness.withSpan).toHaveBeenCalledWith('settlement.refund', expect.any(Function) as () => void);
  });
});

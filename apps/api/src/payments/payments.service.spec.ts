import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { PaymentsService } from './payments.service';
import { PaymentIntentStatus } from './entities/payment-intent-status.enum';
import { PaymentIntent } from '../database/entities/payment-intent.entity';
import { PaymentWebhookEvent } from '../database/entities/payment-webhook-event.entity';
import { EscrowNotAgreedError } from './errors/escrow-not-agreed.error';
import { OnlyBuyerMayFundError } from './errors/only-buyer-may-fund.error';
import { IntentNotQuarantinedError } from './errors/intent-not-quarantined.error';
import { PaymentProvider } from './providers/payment-provider.interface';
import { WebhookSignatureService } from './webhook-signature.service';
import { PayoutService } from './payout.service';
import { EscrowService } from '../escrow/escrow.service';
import { EscrowStateMachine } from '../escrow/escrow-state-machine';
import { EscrowState } from '../escrow/entities/escrow-state.enum';
import { EscrowRole } from '../escrow/entities/escrow-role.enum';
import { LedgerService, PostingLine } from '../ledger/ledger.service';
import { EntryDirection } from '../ledger/entities/entry-direction.enum';
import { escrowHoldingRef, providerClearingRef } from '../ledger/account-refs';
import { KycService } from '../kyc/kyc.service';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationEventType } from '../notifications/entities/notification-event-type.enum';
import { TracingService } from '../observability/tracing.service';
import { TransactionCapExceededError } from '../kyc/errors/transaction-cap-exceeded.error';
import { KycTier } from '../kyc/entities/kyc-tier.enum';
import { Money } from '../common/money/money';
import { callArg } from '../../test/support/mock-calls';

const ESCROW_ID = 'escrow-1';
const BUYER_ID = 'buyer-1';
const SELLER_ID = 'seller-1';
const INTENT_ID = 'intent-1';
const EXEMPT_THRESHOLD = 500_000;

function buildTerms(overrides: Record<string, unknown> = {}) {
  return {
    id: 'terms-1',
    escrowId: ESCROW_ID,
    priceAmount: 100_000,
    priceCurrency: 'NGN',
    requiresVerification: false,
    ...overrides,
  };
}

function buildParties() {
  return [
    { escrowId: ESCROW_ID, userId: BUYER_ID, role: EscrowRole.BUYER },
    { escrowId: ESCROW_ID, userId: SELLER_ID, role: EscrowRole.SELLER },
  ];
}

function buildIntent(overrides: Partial<PaymentIntent> = {}): PaymentIntent {
  return {
    id: INTENT_ID,
    escrowId: ESCROW_ID,
    buyerId: BUYER_ID,
    amount: 100_000,
    currency: 'NGN',
    provider: 'paystack',
    providerReference: 'ref-1',
    status: PaymentIntentStatus.PENDING,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as PaymentIntent;
}

interface Harness {
  service: PaymentsService;
  intentsFindOne: jest.Mock;
  intentsSave: jest.Mock;
  webhookFindOne: jest.Mock;
  webhookSave: jest.Mock;
  getDetail: jest.Mock;
  assertIsParty: jest.Mock;
  transition: jest.Mock;
  postTransaction: jest.Mock;
  assertCanFund: jest.Mock;
  findById: jest.Mock;
  notify: jest.Mock;
  initializeTransaction: jest.Mock;
  verifyPaystack: jest.Mock;
  verifyFlutterwave: jest.Mock;
  handleTransferWebhook: jest.Mock;
  managerSave: jest.Mock;
  transactionSpy: jest.Mock;
}

function buildHarness(
  options: {
    terms?: Record<string, unknown> | null;
    parties?: ReturnType<typeof buildParties>;
    escrowState?: EscrowState;
    existingIntent?: PaymentIntent | null;
    existingWebhook?: unknown;
    buyer?: { id: string; email: string } | null;
  } = {},
): Harness {
  const intentsFindOne = jest
    .fn()
    .mockResolvedValue(options.existingIntent === undefined ? null : options.existingIntent);
  const intentsSave = jest.fn().mockImplementation((row) => Promise.resolve({ ...row, id: INTENT_ID }));
  const intents = {
    findOne: intentsFindOne,
    save: intentsSave,
    create: (row: Partial<PaymentIntent>) => row,
  } as unknown as Repository<PaymentIntent>;

  const webhookFindOne = jest.fn().mockResolvedValue(options.existingWebhook ?? null);
  const webhookSave = jest.fn().mockResolvedValue(undefined);
  const webhookEvents = {
    findOne: webhookFindOne,
    save: webhookSave,
    create: (row: Partial<PaymentWebhookEvent>) => row,
  } as unknown as Repository<PaymentWebhookEvent>;

  const managerSave = jest.fn().mockResolvedValue(undefined);
  const manager = {
    save: managerSave,
    create: (_entity: unknown, row: Record<string, unknown>) => row,
  } as unknown as EntityManager;
  const transactionSpy = jest
    .fn()
    .mockImplementation((cb: (m: EntityManager) => Promise<unknown>) => cb(manager));
  const dataSource = {
    transaction: transactionSpy,
    query: jest.fn().mockResolvedValue([{ value: '1' }]),
  } as unknown as DataSource;

  const getDetail = jest.fn().mockResolvedValue({
    escrow: { id: ESCROW_ID, state: options.escrowState ?? EscrowState.AGREED, version: 3 },
    terms: options.terms === undefined ? buildTerms() : options.terms,
    parties: options.parties ?? buildParties(),
  });
  const assertIsParty = jest.fn().mockResolvedValue(undefined);
  const escrowService = { getDetail, assertIsParty } as unknown as EscrowService;

  const transition = jest
    .fn()
    .mockImplementation((id: string, to: EscrowState) => Promise.resolve({ id, state: to, version: 4 }));
  const stateMachine = { transition } as unknown as EscrowStateMachine;

  const postTransaction = jest.fn().mockResolvedValue(undefined);
  const ledgerService = { postTransaction } as unknown as LedgerService;

  const assertCanFund = jest.fn().mockResolvedValue(undefined);
  const kycService = { assertCanFund } as unknown as KycService;

  const findById = jest
    .fn()
    .mockResolvedValue(
      options.buyer === undefined ? { id: BUYER_ID, email: 'buyer@example.com' } : options.buyer,
    );
  const usersService = { findById } as unknown as UsersService;

  const configService = {
    getOrThrow: jest.fn().mockReturnValue(EXEMPT_THRESHOLD),
  } as unknown as ConfigService;

  const handleTransferWebhook = jest.fn().mockResolvedValue(undefined);
  const payoutService = { handleTransferWebhook } as unknown as PayoutService;

  const notify = jest.fn().mockResolvedValue(undefined);
  const notificationsService = { notify } as unknown as NotificationsService;

  const tracingService = {
    withSpan: jest.fn().mockImplementation((_name: string, fn: () => unknown) => fn()),
  } as unknown as TracingService;

  const initializeTransaction = jest
    .fn()
    .mockResolvedValue({ authorizationUrl: 'https://pay.example/checkout' });
  const paymentProvider = {
    name: 'paystack',
    initializeTransaction,
    initiateTransfer: jest.fn(),
  } as unknown as PaymentProvider;

  const verifyPaystack = jest.fn();
  const verifyFlutterwave = jest.fn();
  const webhookSignature = {
    verifyPaystack,
    verifyFlutterwave,
  } as unknown as WebhookSignatureService;

  const service = new PaymentsService(
    intents,
    webhookEvents,
    dataSource,
    escrowService,
    stateMachine,
    ledgerService,
    kycService,
    usersService,
    configService,
    payoutService,
    notificationsService,
    tracingService,
    paymentProvider,
    webhookSignature,
  );

  return {
    service,
    intentsFindOne,
    intentsSave,
    webhookFindOne,
    webhookSave,
    getDetail,
    assertIsParty,
    transition,
    postTransaction,
    assertCanFund,
    findById,
    notify,
    initializeTransaction,
    verifyPaystack,
    verifyFlutterwave,
    handleTransferWebhook,
    managerSave,
    transactionSpy,
  };
}

describe('PaymentsService.initiateFunding', () => {
  it('refuses anyone but the buyer', async () => {
    const harness = buildHarness();

    await expect(harness.service.initiateFunding(SELLER_ID, ESCROW_ID)).rejects.toBeInstanceOf(
      OnlyBuyerMayFundError,
    );
    expect(harness.initializeTransaction).not.toHaveBeenCalled();
  });

  it('refuses to fund an escrow the parties have not agreed yet', async () => {
    const harness = buildHarness({ escrowState: EscrowState.DRAFT });

    await expect(harness.service.initiateFunding(BUYER_ID, ESCROW_ID)).rejects.toBeInstanceOf(
      EscrowNotAgreedError,
    );
    expect(harness.initializeTransaction).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when the escrow has no frozen terms', async () => {
    const harness = buildHarness({ terms: null });

    await expect(harness.service.initiateFunding(BUYER_ID, ESCROW_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('checks the buyer KYC cap against the escrow price before charging', async () => {
    const harness = buildHarness();

    await harness.service.initiateFunding(BUYER_ID, ESCROW_ID);

    expect(harness.assertCanFund).toHaveBeenCalledWith(
      BUYER_ID,
      expect.objectContaining({ amount: 100_000, currency: 'NGN' }),
      false,
    );
  });

  it('requires verification for a price at or above the exempt threshold', async () => {
    const harness = buildHarness({ terms: buildTerms({ priceAmount: EXEMPT_THRESHOLD }) });

    await harness.service.initiateFunding(BUYER_ID, ESCROW_ID);

    expect(harness.assertCanFund).toHaveBeenCalledWith(BUYER_ID, expect.anything(), true);
  });

  it('requires verification when the terms demand it regardless of price', async () => {
    const harness = buildHarness({ terms: buildTerms({ requiresVerification: true }) });

    await harness.service.initiateFunding(BUYER_ID, ESCROW_ID);

    expect(harness.assertCanFund).toHaveBeenCalledWith(BUYER_ID, expect.anything(), true);
  });

  it('surfaces a KYC cap breach instead of creating an intent', async () => {
    const harness = buildHarness();
    harness.assertCanFund.mockRejectedValue(new TransactionCapExceededError(KycTier.TIER_0, Money.of(50_000, 'NGN')));

    await expect(harness.service.initiateFunding(BUYER_ID, ESCROW_ID)).rejects.toBeInstanceOf(
      TransactionCapExceededError,
    );
    expect(harness.intentsSave).not.toHaveBeenCalled();
  });

  it('reuses a live intent rather than charging the buyer twice', async () => {
    const existing = buildIntent();
    const harness = buildHarness({ existingIntent: existing });

    const response = await harness.service.initiateFunding(BUYER_ID, ESCROW_ID);

    expect(response.id).toBe(INTENT_ID);
    expect(harness.initializeTransaction).not.toHaveBeenCalled();
    expect(harness.intentsSave).not.toHaveBeenCalled();
  });

  it('returns the persisted checkout url when reusing a pending intent', async () => {
    const existing = buildIntent({ authorizationUrl: 'https://pay.example/checkout/original' });
    const harness = buildHarness({ existingIntent: existing });

    const response = await harness.service.initiateFunding(BUYER_ID, ESCROW_ID);

    expect(response.authorizationUrl).toBe('https://pay.example/checkout/original');
  });

  it('starts a fresh intent when the previous one was quarantined', async () => {
    const harness = buildHarness({
      existingIntent: buildIntent({ status: PaymentIntentStatus.QUARANTINED }),
    });

    await harness.service.initiateFunding(BUYER_ID, ESCROW_ID);

    expect(harness.initializeTransaction).toHaveBeenCalledTimes(1);
    expect(harness.intentsSave).toHaveBeenCalledTimes(1);
  });

  it('throws NotFoundException when the buyer account is gone', async () => {
    const harness = buildHarness({ buyer: null });

    await expect(harness.service.initiateFunding(BUYER_ID, ESCROW_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('initializes the provider charge for the exact escrow price', async () => {
    const harness = buildHarness();

    await harness.service.initiateFunding(BUYER_ID, ESCROW_ID);

    expect(harness.initializeTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'buyer@example.com',
        amountKobo: 100_000,
        currency: 'NGN',
        metadata: { escrowId: ESCROW_ID },
      }),
    );
  });

  it('returns the checkout url alongside a pending intent', async () => {
    const harness = buildHarness();

    const response = await harness.service.initiateFunding(BUYER_ID, ESCROW_ID);

    expect(response.authorizationUrl).toBe('https://pay.example/checkout');
    expect(response.status).toBe(PaymentIntentStatus.PENDING);
    expect(response.amount).toBe(100_000);
  });
});

describe('PaymentsService.getLatestIntent', () => {
  it('requires the caller to be a party to the escrow', async () => {
    const harness = buildHarness();

    await harness.service.getLatestIntent(BUYER_ID, ESCROW_ID);

    expect(harness.assertIsParty).toHaveBeenCalledWith(ESCROW_ID, BUYER_ID);
  });

  it('returns a null intent when the escrow was never funded', async () => {
    const harness = buildHarness({ existingIntent: null });

    await expect(harness.service.getLatestIntent(BUYER_ID, ESCROW_ID)).resolves.toEqual({
      intent: null,
    });
  });

  it('returns the most recent intent without an authorization url', async () => {
    const harness = buildHarness({ existingIntent: buildIntent() });

    const response = await harness.service.getLatestIntent(BUYER_ID, ESCROW_ID);

    expect(response.intent?.id).toBe(INTENT_ID);
    expect(response.intent?.authorizationUrl).toBeNull();
  });
});

describe('PaymentsService webhook signatures', () => {
  const paystackDto = {
    event: 'charge.success',
    data: { id: 1, reference: 'ref-1', amount: 100_000, currency: 'NGN', status: 'success' },
  };

  it('verifies the paystack signature before doing any work', async () => {
    const harness = buildHarness();
    harness.verifyPaystack.mockImplementation(() => {
      throw new Error('bad signature');
    });

    await expect(
      harness.service.handlePaystackWebhook(Buffer.from('{}'), 'sig', paystackDto as never),
    ).rejects.toThrow('bad signature');
    expect(harness.webhookFindOne).not.toHaveBeenCalled();
  });

  it('verifies the flutterwave signature before doing any work', async () => {
    const harness = buildHarness();
    harness.verifyFlutterwave.mockImplementation(() => {
      throw new Error('bad signature');
    });

    await expect(
      harness.service.handleFlutterwaveWebhook('sig', {
        event: 'charge.completed',
        data: { id: 1, tx_ref: 'ref-1', amount: 1_000, currency: 'NGN', status: 'successful' },
      }),
    ).rejects.toThrow('bad signature');
    expect(harness.webhookFindOne).not.toHaveBeenCalled();
  });

  it('passes the raw body to the paystack verifier so the hmac matches', async () => {
    const harness = buildHarness();
    const rawBody = Buffer.from(JSON.stringify(paystackDto));

    await harness.service.handlePaystackWebhook(rawBody, 'sig', paystackDto);

    expect(harness.verifyPaystack).toHaveBeenCalledWith(rawBody, 'sig');
  });
});

describe('PaymentsService charge webhook processing', () => {
  function paystackCharge(data: Record<string, unknown> = {}, event = 'charge.success') {
    return {
      event,
      data: { id: 1, reference: 'ref-1', amount: 100_000, currency: 'NGN', status: 'success', ...data },
    };
  }

  async function deliver(harness: Harness, dto: ReturnType<typeof paystackCharge>) {
    await harness.service.handlePaystackWebhook(Buffer.from(JSON.stringify(dto)), 'sig', dto);
  }

  it('ignores an event it has already recorded', async () => {
    const harness = buildHarness({ existingWebhook: { id: 'seen' } });

    await deliver(harness, paystackCharge());

    expect(harness.postTransaction).not.toHaveBeenCalled();
    expect(harness.webhookSave).not.toHaveBeenCalled();
  });

  it('records a non-charge event without touching the ledger', async () => {
    const harness = buildHarness();

    await deliver(harness, paystackCharge({ status: 'failed' }, 'charge.dispute'));

    expect(harness.postTransaction).not.toHaveBeenCalled();
    expect(harness.webhookSave).toHaveBeenCalledTimes(1);
  });

  it('records a failed charge without funding the escrow', async () => {
    const harness = buildHarness();
    const dto = {
      event: 'charge.completed',
      data: { id: 2, tx_ref: 'ref-1', amount: 1_000, currency: 'NGN', status: 'failed' },
    };

    await harness.service.handleFlutterwaveWebhook('sig', dto);

    expect(harness.postTransaction).not.toHaveBeenCalled();
    expect(harness.transition).not.toHaveBeenCalled();
    expect(harness.webhookSave).toHaveBeenCalledTimes(1);
  });

  it('routes a transfer event to the payout service', async () => {
    const harness = buildHarness();

    await deliver(harness, paystackCharge({}, 'transfer.success'));

    expect(harness.handleTransferWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'transfer', reference: 'ref-1' }),
    );
    expect(harness.postTransaction).not.toHaveBeenCalled();
  });

  it('ignores a charge whose reference matches no intent', async () => {
    const harness = buildHarness();
    harness.intentsFindOne.mockResolvedValue(null);

    await deliver(harness, paystackCharge());

    expect(harness.postTransaction).not.toHaveBeenCalled();
    expect(harness.webhookSave).toHaveBeenCalledTimes(1);
  });

  it('ignores a replayed charge for an intent that is already funded', async () => {
    const harness = buildHarness();
    harness.intentsFindOne.mockResolvedValue(buildIntent({ status: PaymentIntentStatus.FUNDED }));

    await deliver(harness, paystackCharge());

    expect(harness.postTransaction).not.toHaveBeenCalled();
  });

  it('quarantines an intent when the charged amount does not match', async () => {
    const harness = buildHarness();
    const intent = buildIntent();
    harness.intentsFindOne.mockResolvedValue(intent);

    await deliver(harness, paystackCharge({ amount: 99_999 }));

    expect(intent.status).toBe(PaymentIntentStatus.QUARANTINED);
    expect(harness.intentsSave).toHaveBeenCalledWith(intent);
    expect(harness.postTransaction).not.toHaveBeenCalled();
    expect(harness.transition).not.toHaveBeenCalled();
  });

  it('quarantines an intent when the charged currency does not match', async () => {
    const harness = buildHarness();
    const intent = buildIntent();
    harness.intentsFindOne.mockResolvedValue(intent);

    await deliver(harness, paystackCharge({ currency: 'USD' }));

    expect(intent.status).toBe(PaymentIntentStatus.QUARANTINED);
    expect(harness.postTransaction).not.toHaveBeenCalled();
  });

  it('moves the charged amount from provider clearing into the escrow holding account', async () => {
    const harness = buildHarness();
    harness.intentsFindOne.mockResolvedValue(buildIntent());

    await deliver(harness, paystackCharge());

    const lines = callArg<PostingLine[]>(harness.postTransaction, 0, 0);
    expect(lines).toEqual([
      expect.objectContaining({
        accountRef: providerClearingRef('paystack'),
        direction: EntryDirection.DEBIT,
        money: expect.objectContaining({ amount: 100_000, currency: 'NGN' }) as Money,
      }),
      expect.objectContaining({
        accountRef: escrowHoldingRef(ESCROW_ID),
        direction: EntryDirection.CREDIT,
        money: expect.objectContaining({ amount: 100_000, currency: 'NGN' }) as Money,
      }),
    ]);
  });

  it('keys the funding posting to the intent so a replay cannot double-credit', async () => {
    const harness = buildHarness();
    harness.intentsFindOne.mockResolvedValue(buildIntent());

    await deliver(harness, paystackCharge());

    expect(callArg(harness.postTransaction, 0, 1)).toEqual(
      expect.objectContaining({ idempotencyKey: `fund:${INTENT_ID}` }),
    );
  });

  it('moves the escrow to FUNDED with no human actor', async () => {
    const harness = buildHarness();
    harness.intentsFindOne.mockResolvedValue(buildIntent());

    await deliver(harness, paystackCharge());

    expect(harness.transition).toHaveBeenCalledWith(
      ESCROW_ID,
      EscrowState.FUNDED,
      expect.objectContaining({ actorId: null }),
      expect.anything(),
    );
  });

  it('marks the intent funded and stores the event inside the same transaction', async () => {
    const harness = buildHarness();
    const intent = buildIntent();
    harness.intentsFindOne.mockResolvedValue(intent);

    await deliver(harness, paystackCharge());

    expect(intent.status).toBe(PaymentIntentStatus.FUNDED);
    expect(harness.managerSave).toHaveBeenCalledWith(PaymentIntent, intent);
    expect(harness.managerSave).toHaveBeenCalledWith(
      PaymentWebhookEvent,
      expect.objectContaining({ provider: 'paystack', providerEventId: '1', escrowId: ESCROW_ID }),
    );
    expect(harness.transactionSpy).toHaveBeenCalledTimes(1);
  });

  it('notifies both parties that the escrow is funded', async () => {
    const harness = buildHarness();
    harness.intentsFindOne.mockResolvedValue(buildIntent());

    await deliver(harness, paystackCharge());

    expect(harness.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        escrowId: ESCROW_ID,
        eventType: NotificationEventType.FUNDED,
        recipientUserIds: [BUYER_ID, SELLER_ID],
      }),
    );
  });
});

describe('PaymentsService.resolveQuarantinedIntent', () => {
  it('moves a quarantined intent back to pending without touching the ledger', async () => {
    const harness = buildHarness({
      existingIntent: buildIntent({ status: PaymentIntentStatus.QUARANTINED }),
    });

    const resolved = await harness.service.resolveQuarantinedIntent(INTENT_ID);

    expect(resolved.status).toBe(PaymentIntentStatus.PENDING);
    expect(harness.postTransaction).not.toHaveBeenCalled();
  });

  it('refuses to resolve an intent that is not quarantined', async () => {
    const harness = buildHarness({
      existingIntent: buildIntent({ status: PaymentIntentStatus.PENDING }),
    });

    await expect(harness.service.resolveQuarantinedIntent(INTENT_ID)).rejects.toThrow(
      IntentNotQuarantinedError,
    );
  });

  it('refuses to resolve an intent that does not exist', async () => {
    const harness = buildHarness({ existingIntent: null });

    await expect(harness.service.resolveQuarantinedIntent(INTENT_ID)).rejects.toThrow(
      IntentNotQuarantinedError,
    );
  });
});

import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { WhatsAppCommandDispatcherService } from './whatsapp-command-dispatcher.service';
import { WhatsAppLinkingService } from './whatsapp-linking.service';
import { WhatsAppPinService } from './whatsapp-pin.service';
import { WhatsAppConversationSessionService } from './whatsapp-conversation-session.service';
import { ConversationState } from './entities/conversation-state.enum';
import { FakeWhatsAppClient } from './client/fake-whatsapp.client';
import { EscrowService } from '../escrow/escrow.service';
import { SettlementService } from '../escrow/settlement.service';
import { ChatService } from '../chat/chat.service';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';
import { Escrow } from '../database/entities/escrow.entity';
import { User } from '../database/entities/user.entity';
import { WhatsAppAccount } from '../database/entities/whatsapp-account.entity';
import { EscrowState } from '../escrow/entities/escrow-state.enum';
import { EscrowRole } from '../escrow/entities/escrow-role.enum';
import { IllegalTransitionError } from '../escrow/errors/illegal-transition.error';
import { WhatsAppTransactionalDisabledError } from './errors/whatsapp-transactional-disabled.error';
import { WhatsAppPinNotSetError } from './errors/whatsapp-pin-not-set.error';
import { callArg } from '../../test/support/mock-calls';

const PHONE = '+2348000000000';
const USER_ID = 'buyer-1';
const SELLER_ID = 'seller-1';
const ESCROW_ID = 'escrow-1';
const ESCROW_CODE = 'ESC-000001';

function buildAccount(overrides: Partial<WhatsAppAccount> = {}): WhatsAppAccount {
  return {
    id: 'account-1',
    userId: USER_ID,
    phoneNumber: PHONE,
    verifiedAt: new Date(),
    pinHash: null,
    pinFailedAttempts: 0,
    pinLockedUntil: null,
    notificationsOptedOutAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function buildEscrow(overrides: Partial<Escrow> = {}): Escrow {
  return {
    id: ESCROW_ID,
    code: ESCROW_CODE,
    state: EscrowState.DELIVERED,
    version: 1,
    trackingReference: null,
    deliveredAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function buildDetail(overrides: { state?: EscrowState } = {}) {
  return {
    escrow: buildEscrow({ state: overrides.state ?? EscrowState.DELIVERED }),
    terms: {
      id: 'terms-1',
      escrowId: ESCROW_ID,
      priceAmount: 100_000,
      priceCurrency: 'NGN',
      inspectionWindowHours: 48,
      deliveryMethod: 'courier',
      itemDescription: 'item',
      feeBps: 250,
      requiresVerification: false,
      agreementText: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    parties: [
      { id: 'p1', escrowId: ESCROW_ID, userId: USER_ID, role: EscrowRole.BUYER, termsAcceptedAt: new Date(), createdAt: new Date() },
      { id: 'p2', escrowId: ESCROW_ID, userId: SELLER_ID, role: EscrowRole.SELLER, termsAcceptedAt: new Date(), createdAt: new Date() },
    ],
  };
}

const CONFIG: Record<string, unknown> = {
  WEB_APP_URL: 'https://app.mezzo.test',
};

interface Harness {
  dispatcher: WhatsAppCommandDispatcherService;
  escrows: { findOne: jest.Mock };
  users: { findOne: jest.Mock };
  escrowService: { assertIsParty: jest.Mock; getDetail: jest.Mock; listForUser: jest.Mock };
  settlementService: { release: jest.Mock; confirmDelivery: jest.Mock };
  chatService: { send: jest.Mock };
  auditService: { record: jest.Mock };
  linkingService: { findByPhoneNumber: jest.Mock; confirmLink: jest.Mock; setOptedOut: jest.Mock };
  pinService: { hasPin: jest.Mock; verify: jest.Mock; setPin: jest.Mock };
  sessionService: { get: jest.Mock; set: jest.Mock; clear: jest.Mock };
  settingsService: { isWhatsappTransactionalEnabled: jest.Mock };
  client: FakeWhatsAppClient;
  config: Record<string, unknown>;
}

function buildHarness(
  options: { configOverrides?: Record<string, unknown>; transactionalEnabled?: boolean } = {},
): Harness {
  const config = { ...CONFIG, ...options.configOverrides };
  const escrows = { findOne: jest.fn().mockResolvedValue(buildEscrow()) };
  const users = { findOne: jest.fn().mockResolvedValue({ id: SELLER_ID, email: 'seller@example.com' }) };
  const escrowService = {
    assertIsParty: jest.fn().mockResolvedValue(undefined),
    getDetail: jest.fn().mockResolvedValue(buildDetail()),
    listForUser: jest.fn().mockResolvedValue([]),
  };
  const settlementService = {
    release: jest.fn().mockResolvedValue(buildEscrow({ state: EscrowState.RELEASED })),
    confirmDelivery: jest.fn().mockResolvedValue(buildEscrow({ state: EscrowState.DELIVERED })),
  };
  const chatService = { send: jest.fn().mockResolvedValue(undefined) };
  const auditService = { record: jest.fn().mockResolvedValue({}) };
  const linkingService = {
    findByPhoneNumber: jest.fn().mockResolvedValue(buildAccount()),
    confirmLink: jest.fn(),
    setOptedOut: jest.fn().mockResolvedValue(undefined),
  };
  const pinService = {
    hasPin: jest.fn().mockReturnValue(true),
    verify: jest.fn().mockResolvedValue(undefined),
    setPin: jest.fn().mockResolvedValue(undefined),
  };
  const sessionService = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn().mockResolvedValue(undefined),
  };
  const client = new FakeWhatsAppClient();
  const configService = { getOrThrow: jest.fn((key: string) => config[key]) };
  const settingsService = {
    isWhatsappTransactionalEnabled: jest.fn().mockResolvedValue(options.transactionalEnabled ?? true),
  };

  const dispatcher = new WhatsAppCommandDispatcherService(
    escrows as unknown as Repository<Escrow>,
    users as unknown as Repository<User>,
    escrowService as unknown as EscrowService,
    settlementService as unknown as SettlementService,
    chatService as unknown as ChatService,
    auditService as unknown as AuditService,
    linkingService as unknown as WhatsAppLinkingService,
    pinService as unknown as WhatsAppPinService,
    sessionService as unknown as WhatsAppConversationSessionService,
    settingsService as unknown as SettingsService,
    configService as unknown as ConfigService,
    client,
  );

  return {
    dispatcher,
    escrows,
    users,
    escrowService,
    settlementService,
    chatService,
    auditService,
    linkingService,
    pinService,
    sessionService,
    settingsService,
    client,
    config,
  };
}

describe('WhatsAppCommandDispatcherService — unlinked numbers', () => {
  it('refuses any command from a number that has not completed linking', async () => {
    const harness = buildHarness();
    harness.linkingService.findByPhoneNumber.mockResolvedValue(null);

    await harness.dispatcher.handle({ waMessageId: 'm1', from: PHONE, text: 'STATUS ESC-000001', buttonReplyId: null });

    expect(harness.escrowService.getDetail).not.toHaveBeenCalled();
    expect(harness.client.lastMessageTo(PHONE)?.body).toMatch(/not linked/i);
  });

  it('treats a bare 6-digit reply as a linking code attempt', async () => {
    const harness = buildHarness();
    harness.linkingService.findByPhoneNumber.mockResolvedValue(null);
    harness.linkingService.confirmLink.mockResolvedValue(buildAccount());

    await harness.dispatcher.handle({ waMessageId: 'm1', from: PHONE, text: '123456', buttonReplyId: null });

    expect(harness.linkingService.confirmLink).toHaveBeenCalledWith(PHONE, '123456');
    expect(harness.auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'WHATSAPP_ACCOUNT_LINKED' }),
    );
  });
});

describe('WhatsAppCommandDispatcherService — release step-up', () => {
  it('requires a PIN to be set before releasing funds', async () => {
    const harness = buildHarness();
    harness.pinService.hasPin.mockReturnValue(false);

    await harness.dispatcher.handle({
      waMessageId: 'm1',
      from: PHONE,
      text: `RELEASE ${ESCROW_CODE}`,
      buttonReplyId: null,
    });

    expect(harness.settlementService.release).not.toHaveBeenCalled();
    expect(harness.client.lastMessageTo(PHONE)?.body).toBe(new WhatsAppPinNotSetError().message);
  });

  it('refuses release and approve while the transactional flag is disabled, but STATUS/LIST still work', async () => {
    const harness = buildHarness({ transactionalEnabled: false });

    await harness.dispatcher.handle({
      waMessageId: 'm1',
      from: PHONE,
      text: `RELEASE ${ESCROW_CODE}`,
      buttonReplyId: null,
    });
    expect(harness.client.lastMessageTo(PHONE)?.body).toBe(new WhatsAppTransactionalDisabledError().message);
    expect(harness.settlementService.release).not.toHaveBeenCalled();

    await harness.dispatcher.handle({ waMessageId: 'm2', from: PHONE, text: 'LIST', buttonReplyId: null });
    expect(harness.escrowService.listForUser).toHaveBeenCalledWith(USER_ID);

    await harness.dispatcher.handle({
      waMessageId: 'm3',
      from: PHONE,
      text: `STATUS ${ESCROW_CODE}`,
      buttonReplyId: null,
    });
    expect(harness.escrowService.getDetail).toHaveBeenCalled();
  });

  it('does not move money on an incorrect PIN and keeps the session open for a retry', async () => {
    const harness = buildHarness();
    harness.sessionService.get.mockResolvedValue({
      state: ConversationState.CONFIRMING_RELEASE,
      userId: USER_ID,
      release: {
        escrowId: ESCROW_ID,
        escrowCode: ESCROW_CODE,
        expectedAmount: 97_500,
        expectedCurrency: 'NGN',
        counterpartyUserId: SELLER_ID,
      },
    });
    const { WhatsAppPinIncorrectError } = await import('./errors/whatsapp-pin-incorrect.error');
    harness.pinService.verify.mockRejectedValue(new WhatsAppPinIncorrectError(2));

    await harness.dispatcher.handle({ waMessageId: 'm1', from: PHONE, text: '0000', buttonReplyId: null });

    expect(harness.settlementService.release).not.toHaveBeenCalled();
    expect(harness.sessionService.clear).not.toHaveBeenCalled();
  });

  it('locks out and clears the session after too many consecutive wrong PIN attempts', async () => {
    const harness = buildHarness();
    harness.sessionService.get.mockResolvedValue({
      state: ConversationState.CONFIRMING_RELEASE,
      userId: USER_ID,
      release: {
        escrowId: ESCROW_ID,
        escrowCode: ESCROW_CODE,
        expectedAmount: 97_500,
        expectedCurrency: 'NGN',
        counterpartyUserId: SELLER_ID,
      },
    });
    const { WhatsAppPinLockedError } = await import('./errors/whatsapp-pin-locked.error');
    harness.pinService.verify.mockRejectedValue(new WhatsAppPinLockedError(new Date(Date.now() + 900_000)));

    await harness.dispatcher.handle({ waMessageId: 'm1', from: PHONE, text: '0000', buttonReplyId: null });

    expect(harness.settlementService.release).not.toHaveBeenCalled();
    expect(harness.sessionService.clear).toHaveBeenCalledWith(PHONE);
  });

  it('releases funds exactly once on a correct PIN, matching the confirmed amount and counterparty, and records exactly one audit event', async () => {
    const harness = buildHarness();
    const release = {
      escrowId: ESCROW_ID,
      escrowCode: ESCROW_CODE,
      expectedAmount: 97_500,
      expectedCurrency: 'NGN' as const,
      counterpartyUserId: SELLER_ID,
    };
    harness.sessionService.get.mockResolvedValue({
      state: ConversationState.CONFIRMING_RELEASE,
      userId: USER_ID,
      release,
    });

    await harness.dispatcher.handle({ waMessageId: 'm1', from: PHONE, text: '1234', buttonReplyId: null });

    expect(harness.settlementService.release).toHaveBeenCalledTimes(1);
    expect(harness.settlementService.release).toHaveBeenCalledWith(ESCROW_ID, USER_ID);
    expect(harness.auditService.record).toHaveBeenCalledTimes(1);
    const recordedEvent = callArg<{
      actorId: string;
      action: string;
      entityId: string;
      after: { amount: number; currency: string; counterpartyUserId: string };
    }>(harness.auditService.record, 0, 0);
    expect(recordedEvent.actorId).toBe(USER_ID);
    expect(recordedEvent.action).toBe('WHATSAPP_RELEASE_FUNDS');
    expect(recordedEvent.entityId).toBe(ESCROW_ID);
    expect(recordedEvent.after).toEqual(
      expect.objectContaining({
        amount: release.expectedAmount,
        currency: release.expectedCurrency,
        counterpartyUserId: SELLER_ID,
      }),
    );
    expect(harness.client.lastMessageTo(PHONE)?.body).toContain('975.00');
    expect(harness.sessionService.clear).toHaveBeenCalledWith(PHONE);
  });

  it('surfaces the exact same IllegalTransitionError the REST API would, without a bot-specific bypass', async () => {
    const harness = buildHarness();
    const error = new IllegalTransitionError(EscrowState.SHIPPED, EscrowState.RELEASED);
    harness.settlementService.release.mockRejectedValue(error);
    harness.sessionService.get.mockResolvedValue({
      state: ConversationState.CONFIRMING_RELEASE,
      userId: USER_ID,
      release: {
        escrowId: ESCROW_ID,
        escrowCode: ESCROW_CODE,
        expectedAmount: 97_500,
        expectedCurrency: 'NGN',
        counterpartyUserId: SELLER_ID,
      },
    });

    await harness.dispatcher.handle({ waMessageId: 'm1', from: PHONE, text: '1234', buttonReplyId: null });

    expect(harness.client.lastMessageTo(PHONE)?.body).toBe(error.message);
    expect(harness.auditService.record).not.toHaveBeenCalled();
  });

  it('cannot resume a stale or expired confirmation once the session is gone', async () => {
    const harness = buildHarness();
    harness.sessionService.get.mockResolvedValue(null);

    await harness.dispatcher.handle({ waMessageId: 'm1', from: PHONE, text: '1234', buttonReplyId: null });

    expect(harness.settlementService.release).not.toHaveBeenCalled();
  });
});

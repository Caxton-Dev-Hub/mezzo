import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { EscrowService } from './escrow.service';
import { EscrowStateMachine } from './escrow-state-machine';
import { EscrowState } from './entities/escrow-state.enum';
import { EscrowRole } from './entities/escrow-role.enum';
import { NotEscrowPartyError } from './errors/not-escrow-party.error';
import { TermsFrozenError } from './errors/terms-frozen.error';
import { EscrowFullError } from './errors/escrow-full.error';
import { CannotJoinOwnEscrowError } from './errors/cannot-join-own-escrow.error';
import { InviteNotFoundError } from './errors/invite-not-found.error';
import { InviteNoLongerValidError } from './errors/invite-no-longer-valid.error';
import { MissingCreationEvidenceError } from './errors/missing-creation-evidence.error';
import { Escrow } from '../database/entities/escrow.entity';
import { EscrowTerms } from '../database/entities/escrow-terms.entity';
import { EscrowParty } from '../database/entities/escrow-party.entity';
import { Invite } from '../database/entities/invite.entity';
import { EvidenceItem } from '../database/entities/evidence-item.entity';
import { EvidenceFlag } from '../database/entities/evidence-flag.entity';
import { EscrowEvent } from '../database/entities/escrow-event.entity';
import { EvidencePhase } from '../evidence/entities/evidence-phase.enum';
import { StorageProvider } from '../evidence/storage/storage-provider.interface';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationEventType } from '../notifications/entities/notification-event-type.enum';
import { callArgs } from '../../test/support/mock-calls';

const ESCROW_ID = 'escrow-1';
const INITIATOR_ID = 'initiator-1';
const JOINER_ID = 'joiner-1';
const INVITE_EXPIRY_HOURS = 72;

function buildEscrow(overrides: Partial<Escrow> = {}): Escrow {
  return {
    id: ESCROW_ID,
    code: 'ESC-000001',
    state: EscrowState.PENDING_COUNTERPARTY,
    version: 2,
    trackingReference: null,
    deliveredAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function buildTerms(overrides: Partial<EscrowTerms> = {}): EscrowTerms {
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
    agreementText: null,
    ...overrides,
  } as EscrowTerms;
}

function buildParty(overrides: Partial<EscrowParty> = {}): EscrowParty {
  return {
    escrowId: ESCROW_ID,
    userId: INITIATOR_ID,
    role: EscrowRole.SELLER,
    termsAcceptedAt: null,
    ...overrides,
  } as EscrowParty;
}

function buildInvite(overrides: Partial<Invite> = {}): Invite {
  return {
    id: 'invite-1',
    escrowId: ESCROW_ID,
    token: 'token-1',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    usedAt: null,
    usedByUserId: null,
    ...overrides,
  } as Invite;
}

function buildEvidenceItem(overrides: Partial<EvidenceItem> = {}): EvidenceItem {
  return {
    id: 'evidence-1',
    escrowId: ESCROW_ID,
    uploaderId: INITIATOR_ID,
    phase: EvidencePhase.AT_CREATION,
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
    createdAt: new Date(),
    ...overrides,
  } as EvidenceItem;
}

interface Harness {
  service: EscrowService;
  escrowsFindOne: jest.Mock;
  escrowsFind: jest.Mock;
  termsFindOne: jest.Mock;
  termsFind: jest.Mock;
  termsSave: jest.Mock;
  partiesFindOne: jest.Mock;
  partiesFind: jest.Mock;
  partiesSave: jest.Mock;
  invitesFindOne: jest.Mock;
  invitesSave: jest.Mock;
  evidenceCount: jest.Mock;
  evidenceFind: jest.Mock;
  flagsFind: jest.Mock;
  eventsFind: jest.Mock;
  eventsCount: jest.Mock;
  transition: jest.Mock;
  transitionIdempotent: jest.Mock;
  notify: jest.Mock;
  emit: jest.Mock;
  presignDownload: jest.Mock;
  managerSave: jest.Mock;
}

function buildHarness(
  options: {
    escrow?: Escrow | null;
    escrows?: Escrow[];
    terms?: EscrowTerms | null;
    termsList?: EscrowTerms[];
    party?: EscrowParty | null;
    parties?: EscrowParty[];
    invite?: Invite | null;
    evidenceCount?: number;
    evidenceItems?: EvidenceItem[];
    events?: EscrowEvent[];
    eventsCount?: number;
  } = {},
): Harness {
  const escrowsFindOne = jest
    .fn()
    .mockResolvedValue(options.escrow === undefined ? buildEscrow() : options.escrow);
  const escrowsFind = jest.fn().mockResolvedValue(options.escrows ?? []);
  const escrows = { findOne: escrowsFindOne, find: escrowsFind } as unknown as Repository<Escrow>;

  const termsFindOne = jest
    .fn()
    .mockResolvedValue(options.terms === undefined ? buildTerms() : options.terms);
  const termsFind = jest.fn().mockResolvedValue(options.termsList ?? []);
  const termsSave = jest.fn().mockImplementation((row) => Promise.resolve(row));
  const terms = {
    findOne: termsFindOne,
    find: termsFind,
    save: termsSave,
  } as unknown as Repository<EscrowTerms>;

  const partiesFindOne = jest
    .fn()
    .mockResolvedValue(options.party === undefined ? buildParty() : options.party);
  const partiesFind = jest.fn().mockResolvedValue(options.parties ?? [buildParty()]);
  const partiesSave = jest.fn().mockImplementation((row) => Promise.resolve(row));
  const parties = {
    findOne: partiesFindOne,
    find: partiesFind,
    save: partiesSave,
  } as unknown as Repository<EscrowParty>;

  const invitesFindOne = jest
    .fn()
    .mockResolvedValue(options.invite === undefined ? buildInvite() : options.invite);
  const invitesSave = jest.fn().mockImplementation((row) => Promise.resolve(row));
  const invites = {
    findOne: invitesFindOne,
    save: invitesSave,
    create: (row: Partial<Invite>) => row,
  } as unknown as Repository<Invite>;

  const evidenceCount = jest.fn().mockResolvedValue(options.evidenceCount ?? 1);
  const evidenceFind = jest.fn().mockResolvedValue(options.evidenceItems ?? []);
  const evidenceItems = {
    count: evidenceCount,
    find: evidenceFind,
  } as unknown as Repository<EvidenceItem>;

  const flagsFind = jest.fn().mockResolvedValue([]);
  const evidenceFlags = { find: flagsFind } as unknown as Repository<EvidenceFlag>;

  const eventsFind = jest.fn().mockResolvedValue(options.events ?? []);
  const eventsCount = jest.fn().mockResolvedValue(options.eventsCount ?? 0);
  const escrowEvents = {
    find: eventsFind,
    count: eventsCount,
  } as unknown as Repository<EscrowEvent>;

  const managerSave = jest
    .fn()
    .mockImplementation((_entity, row) => Promise.resolve({ id: ESCROW_ID, ...row }));
  const manager = {
    save: managerSave,
    create: (_entity: unknown, row: Record<string, unknown>) => row,
    query: jest.fn().mockResolvedValue([{ value: '1' }]),
  } as unknown as EntityManager;
  const dataSource = {
    transaction: jest.fn().mockImplementation((cb: (m: EntityManager) => Promise<unknown>) => cb(manager)),
  } as unknown as DataSource;

  const transition = jest
    .fn()
    .mockImplementation((id: string, to: EscrowState) => Promise.resolve(buildEscrow({ id, state: to })));
  const transitionIdempotent = jest
    .fn()
    .mockImplementation((id: string, to: EscrowState) => Promise.resolve(buildEscrow({ id, state: to })));
  const stateMachine = { transition, transitionIdempotent } as unknown as EscrowStateMachine;

  const configService = {
    getOrThrow: jest.fn().mockReturnValue(INVITE_EXPIRY_HOURS),
  } as unknown as ConfigService;

  const notify = jest.fn().mockResolvedValue(undefined);
  const notificationsService = { notify } as unknown as NotificationsService;

  const emit = jest.fn();
  const eventEmitter = { emit } as unknown as EventEmitter2;

  const presignDownload = jest.fn().mockResolvedValue('https://cdn.example/one.jpg');
  const storage = { getPresignedDownloadUrl: presignDownload } as unknown as StorageProvider;

  const service = new EscrowService(
    escrows,
    terms,
    parties,
    invites,
    evidenceItems,
    evidenceFlags,
    escrowEvents,
    dataSource,
    stateMachine,
    configService,
    notificationsService,
    eventEmitter,
    storage,
  );

  return {
    service,
    escrowsFindOne,
    escrowsFind,
    termsFindOne,
    termsFind,
    termsSave,
    partiesFindOne,
    partiesFind,
    partiesSave,
    invitesFindOne,
    invitesSave,
    evidenceCount,
    evidenceFind,
    flagsFind,
    eventsFind,
    eventsCount,
    transition,
    transitionIdempotent,
    notify,
    emit,
    presignDownload,
    managerSave,
  };
}

const createDto = {
  price: { amount: 100_000, currency: 'NGN' as const },
  inspectionWindowHours: 72,
  deliveryMethod: 'Courier',
  itemDescription: 'A used camera lens',
  feeBps: 250,
  requiresVerification: false,
  role: EscrowRole.SELLER,
};

describe('EscrowService.createDraft', () => {
  it('creates the escrow, its terms, and the initiator party in one transaction', async () => {
    const harness = buildHarness();

    await harness.service.createDraft(INITIATOR_ID, createDto);

    expect(harness.managerSave).toHaveBeenCalledWith(Escrow, expect.anything());
    expect(harness.managerSave).toHaveBeenCalledWith(
      EscrowTerms,
      expect.objectContaining({ priceAmount: 100_000, priceCurrency: 'NGN', feeBps: 250 }),
    );
    expect(harness.managerSave).toHaveBeenCalledWith(
      EscrowParty,
      expect.objectContaining({ userId: INITIATOR_ID, role: EscrowRole.SELLER, termsAcceptedAt: null }),
    );
  });

  it('stores the price as integer minor units in the declared currency', async () => {
    const harness = buildHarness();

    await harness.service.createDraft(INITIATOR_ID, {
      ...createDto,
      price: { amount: 250_075, currency: 'NGN' },
    });

    const saved = callArgs(harness.managerSave).find((call) => call[0] === EscrowTerms)?.[1] as
      | EscrowTerms
      | undefined;
    expect(saved?.priceAmount).toBe(250_075);
    expect(Number.isInteger(saved?.priceAmount)).toBe(true);
  });

  it('defaults a missing agreement text to null rather than undefined', async () => {
    const harness = buildHarness();

    await harness.service.createDraft(INITIATOR_ID, createDto);

    const saved = callArgs(harness.managerSave).find((call) => call[0] === EscrowTerms)?.[1] as
      | EscrowTerms
      | undefined;
    expect(saved?.agreementText).toBeNull();
  });
});

describe('EscrowService.invite', () => {
  it('refuses a caller who is not a party to the escrow', async () => {
    const harness = buildHarness({ party: null });

    await expect(harness.service.invite(ESCROW_ID, 'stranger')).rejects.toBeInstanceOf(
      NotEscrowPartyError,
    );
    expect(harness.transition).not.toHaveBeenCalled();
  });

  it('refuses to invite before any creation evidence exists', async () => {
    const harness = buildHarness({ evidenceCount: 0 });

    await expect(harness.service.invite(ESCROW_ID, INITIATOR_ID)).rejects.toBeInstanceOf(
      MissingCreationEvidenceError,
    );
    expect(harness.transition).not.toHaveBeenCalled();
    expect(harness.invitesSave).not.toHaveBeenCalled();
  });

  it('moves the escrow to PENDING_COUNTERPARTY and mints a token', async () => {
    const harness = buildHarness();

    const invite = await harness.service.invite(ESCROW_ID, INITIATOR_ID);

    expect(harness.transition).toHaveBeenCalledWith(
      ESCROW_ID,
      EscrowState.PENDING_COUNTERPARTY,
      expect.objectContaining({ actorId: INITIATOR_ID }),
    );
    expect(invite.token).toEqual(expect.any(String) as string);
  });

  it('expires the invite after the configured window', async () => {
    const harness = buildHarness();

    const invite = await harness.service.invite(ESCROW_ID, INITIATOR_ID);

    const expectedMs = Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000;
    expect(invite.expiresAt.getTime()).toBeGreaterThan(expectedMs - 5_000);
    expect(invite.expiresAt.getTime()).toBeLessThanOrEqual(expectedMs + 5_000);
  });

  it('notifies only the initiator that the escrow was created', async () => {
    const harness = buildHarness();

    await harness.service.invite(ESCROW_ID, INITIATOR_ID);

    expect(harness.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: NotificationEventType.ESCROW_CREATED,
        recipientUserIds: [INITIATOR_ID],
      }),
    );
  });
});

describe('EscrowService.previewInvite', () => {
  it('rejects an unknown token', async () => {
    const harness = buildHarness({ invite: null });

    await expect(harness.service.previewInvite('nope')).rejects.toBeInstanceOf(InviteNotFoundError);
  });

  it('rejects an invite that was already used', async () => {
    const harness = buildHarness({ invite: buildInvite({ usedAt: new Date() }) });

    await expect(harness.service.previewInvite('token-1')).rejects.toBeInstanceOf(
      InviteNoLongerValidError,
    );
  });

  it('rejects an expired invite', async () => {
    const harness = buildHarness({
      invite: buildInvite({ expiresAt: new Date(Date.now() - 1_000) }),
    });

    await expect(harness.service.previewInvite('token-1')).rejects.toBeInstanceOf(
      InviteNoLongerValidError,
    );
  });

  it('rejects an invite whose escrow has moved on', async () => {
    const harness = buildHarness({ escrow: buildEscrow({ state: EscrowState.FUNDED }) });

    await expect(harness.service.previewInvite('token-1')).rejects.toBeInstanceOf(
      InviteNoLongerValidError,
    );
  });

  it('throws NotFoundException when the invite points at a missing escrow', async () => {
    const harness = buildHarness({ escrow: null });

    await expect(harness.service.previewInvite('token-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('shows the counterparty the terms, the initiator role, and the deadline', async () => {
    const harness = buildHarness();

    const preview = await harness.service.previewInvite('token-1');

    expect(preview.escrowId).toBe(ESCROW_ID);
    expect(preview.initiatorRole).toBe(EscrowRole.SELLER);
    expect(preview.terms.price).toEqual({ amount: 100_000, currency: 'NGN' });
    expect(preview.expiresAt).toBeInstanceOf(Date);
  });

  it('hands back a viewable url for each piece of creation evidence', async () => {
    const harness = buildHarness({ evidenceItems: [buildEvidenceItem()] });

    const preview = await harness.service.previewInvite('token-1');

    expect(harness.presignDownload).toHaveBeenCalledWith('evidence/one.jpg');
    expect(preview.evidence).toEqual([
      expect.objectContaining({ id: 'evidence-1', url: 'https://cdn.example/one.jpg' }),
    ]);
  });

  it('skips the flag lookup when there is no creation evidence', async () => {
    const harness = buildHarness({ evidenceItems: [] });

    await harness.service.previewInvite('token-1');

    expect(harness.flagsFind).not.toHaveBeenCalled();
  });
});

describe('EscrowService.acceptInvite', () => {
  it('refuses to add a third party to a full escrow', async () => {
    const harness = buildHarness({
      parties: [buildParty(), buildParty({ userId: 'other', role: EscrowRole.BUYER })],
    });

    await expect(harness.service.acceptInvite('token-1', JOINER_ID)).rejects.toBeInstanceOf(
      EscrowFullError,
    );
  });

  it('refuses to let the initiator join their own escrow', async () => {
    const harness = buildHarness({ parties: [buildParty({ userId: JOINER_ID })] });

    await expect(harness.service.acceptInvite('token-1', JOINER_ID)).rejects.toBeInstanceOf(
      CannotJoinOwnEscrowError,
    );
  });

  it('joins the counterparty in the role opposite the initiator', async () => {
    const harness = buildHarness({ parties: [buildParty({ role: EscrowRole.SELLER })] });

    await harness.service.acceptInvite('token-1', JOINER_ID);

    expect(harness.managerSave).toHaveBeenCalledWith(
      EscrowParty,
      expect.objectContaining({ userId: JOINER_ID, role: EscrowRole.BUYER }),
    );
  });

  it('joins a seller when the initiator was the buyer', async () => {
    const harness = buildHarness({ parties: [buildParty({ role: EscrowRole.BUYER })] });

    await harness.service.acceptInvite('token-1', JOINER_ID);

    expect(harness.managerSave).toHaveBeenCalledWith(
      EscrowParty,
      expect.objectContaining({ role: EscrowRole.SELLER }),
    );
  });

  it('burns the invite so it cannot be reused', async () => {
    const invite = buildInvite();
    const harness = buildHarness({ invite });

    await harness.service.acceptInvite('token-1', JOINER_ID);

    expect(invite.usedAt).toBeInstanceOf(Date);
    expect(invite.usedByUserId).toBe(JOINER_ID);
    expect(harness.managerSave).toHaveBeenCalledWith(Invite, invite);
  });

  it('announces the join so a waiting initiator sees it live', async () => {
    const harness = buildHarness();

    await harness.service.acceptInvite('token-1', JOINER_ID);

    expect(harness.emit).toHaveBeenCalledWith(
      'escrow.updated',
      expect.objectContaining({ escrowId: ESCROW_ID, eventType: 'COUNTERPARTY_JOINED' }),
    );
  });
});

describe('EscrowService.acceptTerms', () => {
  it('refuses a caller who is not a party', async () => {
    const harness = buildHarness({ party: null });

    await expect(harness.service.acceptTerms(ESCROW_ID, 'stranger')).rejects.toBeInstanceOf(
      NotEscrowPartyError,
    );
  });

  it('stamps the acceptance time on the accepting party', async () => {
    const party = buildParty();
    const harness = buildHarness({ party });

    await harness.service.acceptTerms(ESCROW_ID, INITIATOR_ID);

    expect(party.termsAcceptedAt).toBeInstanceOf(Date);
    expect(harness.partiesSave).toHaveBeenCalledWith(party);
  });

  it('waits for the counterparty before agreeing', async () => {
    const harness = buildHarness({
      party: buildParty(),
      parties: [
        buildParty({ termsAcceptedAt: new Date() }),
        buildParty({ userId: JOINER_ID, role: EscrowRole.BUYER, termsAcceptedAt: null }),
      ],
    });

    const escrow = await harness.service.acceptTerms(ESCROW_ID, INITIATOR_ID);

    expect(harness.transition).not.toHaveBeenCalled();
    expect(escrow.id).toBe(ESCROW_ID);
  });

  it('does not agree while only one party exists', async () => {
    const harness = buildHarness({ parties: [buildParty({ termsAcceptedAt: new Date() })] });

    await harness.service.acceptTerms(ESCROW_ID, INITIATOR_ID);

    expect(harness.transition).not.toHaveBeenCalled();
  });

  it('moves to AGREED once both parties have accepted', async () => {
    const harness = buildHarness({
      parties: [
        buildParty({ termsAcceptedAt: new Date() }),
        buildParty({ userId: JOINER_ID, role: EscrowRole.BUYER, termsAcceptedAt: new Date() }),
      ],
    });

    const escrow = await harness.service.acceptTerms(ESCROW_ID, INITIATOR_ID);

    expect(escrow.state).toBe(EscrowState.AGREED);
    expect(harness.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: NotificationEventType.AGREED,
        recipientUserIds: [INITIATOR_ID, JOINER_ID],
      }),
    );
  });

  it('throws NotFoundException when the escrow disappeared mid-flight', async () => {
    const harness = buildHarness({ escrow: null, parties: [buildParty()] });

    await expect(harness.service.acceptTerms(ESCROW_ID, INITIATOR_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('EscrowService.updateTerms', () => {
  const updateDto = {
    price: { amount: 200_000, currency: 'NGN' as const },
    inspectionWindowHours: 24,
    deliveryMethod: 'Pickup',
    itemDescription: 'A different lens',
    feeBps: 300,
    requiresVerification: true,
    agreementText: 'Updated agreement',
  };

  it('throws NotFoundException for an unknown escrow', async () => {
    const harness = buildHarness({ escrow: null });

    await expect(
      harness.service.updateTerms(ESCROW_ID, INITIATOR_ID, updateDto),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('allows edits while the escrow is still a draft', async () => {
    const harness = buildHarness({ escrow: buildEscrow({ state: EscrowState.DRAFT }) });

    await expect(
      harness.service.updateTerms(ESCROW_ID, INITIATOR_ID, updateDto),
    ).resolves.toEqual(expect.objectContaining({ priceAmount: 200_000 }));
  });

  it('allows edits while the escrow is waiting for a counterparty', async () => {
    const harness = buildHarness({ escrow: buildEscrow({ state: EscrowState.PENDING_COUNTERPARTY }) });

    await expect(
      harness.service.updateTerms(ESCROW_ID, INITIATOR_ID, updateDto),
    ).resolves.toBeDefined();
  });

  it('freezes the terms once the parties have agreed', async () => {
    const harness = buildHarness({ escrow: buildEscrow({ state: EscrowState.AGREED }) });

    await expect(
      harness.service.updateTerms(ESCROW_ID, INITIATOR_ID, updateDto),
    ).rejects.toBeInstanceOf(TermsFrozenError);
    expect(harness.termsSave).not.toHaveBeenCalled();
  });

  it('freezes the terms once the escrow is funded', async () => {
    const harness = buildHarness({ escrow: buildEscrow({ state: EscrowState.FUNDED }) });

    await expect(
      harness.service.updateTerms(ESCROW_ID, INITIATOR_ID, updateDto),
    ).rejects.toBeInstanceOf(TermsFrozenError);
  });

  it('refuses an editor who is not a party', async () => {
    const harness = buildHarness({
      escrow: buildEscrow({ state: EscrowState.DRAFT }),
      party: null,
    });

    await expect(
      harness.service.updateTerms(ESCROW_ID, 'stranger', updateDto),
    ).rejects.toBeInstanceOf(NotEscrowPartyError);
  });

  it('throws NotFoundException when the terms row is missing', async () => {
    const harness = buildHarness({ escrow: buildEscrow({ state: EscrowState.DRAFT }), terms: null });

    await expect(
      harness.service.updateTerms(ESCROW_ID, INITIATOR_ID, updateDto),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('writes every editable field through', async () => {
    const harness = buildHarness({ escrow: buildEscrow({ state: EscrowState.DRAFT }) });

    const saved = await harness.service.updateTerms(ESCROW_ID, INITIATOR_ID, updateDto);

    expect(saved).toEqual(
      expect.objectContaining({
        priceAmount: 200_000,
        priceCurrency: 'NGN',
        inspectionWindowHours: 24,
        deliveryMethod: 'Pickup',
        itemDescription: 'A different lens',
        feeBps: 300,
        requiresVerification: true,
        agreementText: 'Updated agreement',
      }),
    );
  });

  it('clears the agreement text when the caller omits it', async () => {
    const harness = buildHarness({ escrow: buildEscrow({ state: EscrowState.DRAFT }) });

    const saved = await harness.service.updateTerms(ESCROW_ID, INITIATOR_ID, {
      ...updateDto,
      agreementText: undefined,
    });

    expect(saved?.agreementText).toBeNull();
  });
});

describe('EscrowService.cancel', () => {
  it('cancels idempotently so a double click is harmless', async () => {
    const harness = buildHarness();

    const escrow = await harness.service.cancel(ESCROW_ID, INITIATOR_ID);

    expect(harness.transitionIdempotent).toHaveBeenCalledWith(ESCROW_ID, EscrowState.CANCELLED, {
      actorId: INITIATOR_ID,
      reason: 'Cancelled by a party',
    });
    expect(escrow.state).toBe(EscrowState.CANCELLED);
  });
});

describe('EscrowService.getDetail', () => {
  it('throws NotFoundException for an unknown escrow', async () => {
    const harness = buildHarness({ escrow: null });

    await expect(harness.service.getDetail(ESCROW_ID)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns the escrow with its terms and parties', async () => {
    const harness = buildHarness();

    const detail = await harness.service.getDetail(ESCROW_ID);

    expect(detail.escrow.id).toBe(ESCROW_ID);
    expect(detail.terms?.priceAmount).toBe(100_000);
    expect(detail.parties).toHaveLength(1);
  });

  it('returns null terms for an escrow that has none yet', async () => {
    const harness = buildHarness({ terms: null });

    const detail = await harness.service.getDetail(ESCROW_ID);

    expect(detail.terms).toBeNull();
  });
});

describe('EscrowService.listForUser', () => {
  it('returns an empty list when the user is party to nothing', async () => {
    const harness = buildHarness({ parties: [] });

    await expect(harness.service.listForUser(INITIATOR_ID)).resolves.toEqual([]);
    expect(harness.escrowsFind).not.toHaveBeenCalled();
  });

  it('groups terms and parties onto each escrow it returns', async () => {
    const other = buildEscrow({ id: 'escrow-2' });
    const harness = buildHarness({
      parties: [buildParty(), buildParty({ escrowId: 'escrow-2', userId: JOINER_ID })],
      escrows: [buildEscrow(), other],
      termsList: [buildTerms(), buildTerms({ id: 'terms-2', escrowId: 'escrow-2' })],
    });

    const list = await harness.service.listForUser(INITIATOR_ID);

    expect(list).toHaveLength(2);
    expect(list[0].terms?.escrowId).toBe(ESCROW_ID);
    expect(list[0].parties.map((party) => party.escrowId)).toEqual([ESCROW_ID]);
    expect(list[1].terms?.escrowId).toBe('escrow-2');
  });

  it('leaves terms null for an escrow that has none', async () => {
    const harness = buildHarness({
      parties: [buildParty()],
      escrows: [buildEscrow()],
      termsList: [],
    });

    const [entry] = await harness.service.listForUser(INITIATOR_ID);

    expect(entry.terms).toBeNull();
    expect(entry.parties).toEqual([expect.objectContaining({ escrowId: ESCROW_ID })]);
  });
});

describe('EscrowService.assertIsParty', () => {
  it('passes for a party', async () => {
    const harness = buildHarness();

    await expect(harness.service.assertIsParty(ESCROW_ID, INITIATOR_ID)).resolves.toBeUndefined();
  });

  it('throws for a stranger', async () => {
    const harness = buildHarness({ party: null });

    await expect(harness.service.assertIsParty(ESCROW_ID, 'stranger')).rejects.toBeInstanceOf(
      NotEscrowPartyError,
    );
  });
});

describe('EscrowService.hasEverBeenDisputed', () => {
  it('is false for an escrow that never entered DISPUTED', async () => {
    const harness = buildHarness({ eventsCount: 0 });

    await expect(harness.service.hasEverBeenDisputed(ESCROW_ID)).resolves.toBe(false);
  });

  it('is true once a DISPUTED event exists, even after resolution', async () => {
    const harness = buildHarness({ eventsCount: 1 });

    await expect(harness.service.hasEverBeenDisputed(ESCROW_ID)).resolves.toBe(true);
    expect(harness.eventsCount).toHaveBeenCalledWith({
      where: { escrowId: ESCROW_ID, toState: EscrowState.DISPUTED },
    });
  });
});

describe('EscrowService.getEvents', () => {
  it('returns the escrow history oldest first', async () => {
    const harness = buildHarness();

    await harness.service.getEvents(ESCROW_ID);

    expect(harness.eventsFind).toHaveBeenCalledWith({
      where: { escrowId: ESCROW_ID },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
  });
});

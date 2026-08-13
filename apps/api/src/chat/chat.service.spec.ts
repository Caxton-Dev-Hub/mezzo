import { Repository } from 'typeorm';
import { ChatService } from './chat.service';
import { EvidenceAttachmentNotFoundError } from './errors/evidence-attachment-not-found.error';
import { ChatMessage } from '../database/entities/chat-message.entity';
import { ChatRead } from '../database/entities/chat-read.entity';
import { EvidenceItem } from '../database/entities/evidence-item.entity';
import { EvidenceFlag } from '../database/entities/evidence-flag.entity';
import { EscrowService } from '../escrow/escrow.service';
import { EscrowRole } from '../escrow/entities/escrow-role.enum';
import { NotEscrowPartyError } from '../escrow/errors/not-escrow-party.error';
import { EvidencePhase } from '../evidence/entities/evidence-phase.enum';
import { EvidenceFlagType } from '../evidence/entities/evidence-flag-type.enum';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { UserRole } from '../users/entities/user-role.enum';
import { StorageProvider } from '../evidence/storage/storage-provider.interface';

const ESCROW_ID = 'escrow-1';
const BUYER_ID = 'buyer-1';
const SELLER_ID = 'seller-1';

const buyer: AuthenticatedUser = { id: BUYER_ID, role: UserRole.USER };
const stranger: AuthenticatedUser = { id: 'stranger-1', role: UserRole.USER };
const arbiter: AuthenticatedUser = { id: 'arbiter-1', role: UserRole.ARBITER };
const admin: AuthenticatedUser = { id: 'admin-1', role: UserRole.ADMIN };

function buildMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'message-1',
    escrowId: ESCROW_ID,
    senderId: BUYER_ID,
    body: 'Has it shipped yet?',
    attachmentEvidenceItemId: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  } as ChatMessage;
}

function buildItem(overrides: Partial<EvidenceItem> = {}): EvidenceItem {
  return {
    id: 'item-1',
    escrowId: ESCROW_ID,
    uploaderId: BUYER_ID,
    phase: EvidencePhase.CHAT,
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
  service: ChatService;
  messagesFind: jest.Mock;
  messagesSave: jest.Mock;
  itemsFind: jest.Mock;
  itemsFindOne: jest.Mock;
  flagsFind: jest.Mock;
  readsFind: jest.Mock;
  readsValues: jest.Mock;
  getDetail: jest.Mock;
  hasEverBeenDisputed: jest.Mock;
  getPresignedDownloadUrl: jest.Mock;
}

function buildHarness(
  options: {
    parties?: { userId: string; role: EscrowRole }[];
    disputed?: boolean;
    messages?: ChatMessage[];
    items?: EvidenceItem[];
    flags?: EvidenceFlag[];
    attachment?: EvidenceItem | null;
    reads?: ChatRead[];
  } = {},
): Harness {
  const messagesFind = jest.fn().mockResolvedValue(options.messages ?? []);
  const messagesSave = jest.fn().mockImplementation((row) => Promise.resolve({ id: 'message-1', createdAt: new Date(), ...row }));
  const messages = {
    find: messagesFind,
    save: messagesSave,
    create: (row: Partial<ChatMessage>) => row,
  } as unknown as Repository<ChatMessage>;

  const itemsFind = jest.fn().mockResolvedValue(options.items ?? []);
  const itemsFindOne = jest
    .fn()
    .mockResolvedValue(options.attachment === undefined ? buildItem() : options.attachment);
  const evidenceItems = {
    find: itemsFind,
    findOne: itemsFindOne,
  } as unknown as Repository<EvidenceItem>;

  const flagsFind = jest.fn().mockResolvedValue(options.flags ?? []);
  const evidenceFlags = { find: flagsFind } as unknown as Repository<EvidenceFlag>;

  const readsValues = jest.fn();
  const builder = {
    insert: () => builder,
    values: (row: unknown) => {
      readsValues(row);
      return builder;
    },
    orUpdate: () => builder,
    execute: () => Promise.resolve(undefined),
  };
  const readsFind = jest.fn().mockResolvedValue(options.reads ?? []);
  const chatReads = {
    createQueryBuilder: () => builder,
    find: readsFind,
  } as unknown as Repository<ChatRead>;

  const getDetail = jest.fn().mockResolvedValue({
    escrow: { id: ESCROW_ID },
    terms: null,
    parties: options.parties ?? [
      { userId: BUYER_ID, role: EscrowRole.BUYER },
      { userId: SELLER_ID, role: EscrowRole.SELLER },
    ],
  });
  const hasEverBeenDisputed = jest.fn().mockResolvedValue(options.disputed ?? false);
  const escrowService = { getDetail, hasEverBeenDisputed } as unknown as EscrowService;

  const getPresignedDownloadUrl = jest.fn().mockImplementation((key: string) => Promise.resolve(`https://storage.test/${key}`));
  const storage = { getPresignedDownloadUrl } as unknown as StorageProvider;

  return {
    service: new ChatService(messages, evidenceItems, evidenceFlags, chatReads, escrowService, storage),
    messagesFind,
    messagesSave,
    itemsFind,
    itemsFindOne,
    flagsFind,
    readsFind,
    readsValues,
    getDetail,
    hasEverBeenDisputed,
    getPresignedDownloadUrl,
  };
}

describe('ChatService.assertCanAccess', () => {
  it('lets a party into their own escrow chat', async () => {
    const harness = buildHarness();

    await expect(harness.service.assertCanAccess(ESCROW_ID, buyer)).resolves.toBeUndefined();
    expect(harness.hasEverBeenDisputed).not.toHaveBeenCalled();
  });

  it('keeps an unrelated user out', async () => {
    const harness = buildHarness();

    await expect(harness.service.assertCanAccess(ESCROW_ID, stranger)).rejects.toBeInstanceOf(
      NotEscrowPartyError,
    );
  });

  it('keeps an arbiter out of a chat that was never disputed', async () => {
    const harness = buildHarness({ disputed: false });

    await expect(harness.service.assertCanAccess(ESCROW_ID, arbiter)).rejects.toBeInstanceOf(
      NotEscrowPartyError,
    );
  });

  it('lets an arbiter read a chat once the escrow has been disputed', async () => {
    const harness = buildHarness({ disputed: true });

    await expect(harness.service.assertCanAccess(ESCROW_ID, arbiter)).resolves.toBeUndefined();
  });

  it('lets an admin read a disputed chat on the same terms', async () => {
    const harness = buildHarness({ disputed: true });

    await expect(harness.service.assertCanAccess(ESCROW_ID, admin)).resolves.toBeUndefined();
  });
});

describe('ChatService.send', () => {
  it('refuses to post into a chat the caller cannot access', async () => {
    const harness = buildHarness();

    await expect(harness.service.send(ESCROW_ID, stranger, { body: 'hi' })).rejects.toBeInstanceOf(
      NotEscrowPartyError,
    );
    expect(harness.messagesSave).not.toHaveBeenCalled();
  });

  it('stores a plain message with no attachment', async () => {
    const harness = buildHarness();

    const message = await harness.service.send(ESCROW_ID, buyer, { body: 'Has it shipped?' });

    expect(harness.messagesSave).toHaveBeenCalledWith(
      expect.objectContaining({
        escrowId: ESCROW_ID,
        senderId: BUYER_ID,
        body: 'Has it shipped?',
        attachmentEvidenceItemId: null,
      }),
    );
    expect(message.attachment).toBeNull();
  });

  it('rejects an attachment that does not belong to this escrow', async () => {
    const harness = buildHarness({ attachment: null });

    await expect(
      harness.service.send(ESCROW_ID, buyer, { body: 'see this', attachmentEvidenceItemId: 'item-9' }),
    ).rejects.toBeInstanceOf(EvidenceAttachmentNotFoundError);
    expect(harness.messagesSave).not.toHaveBeenCalled();
  });

  it('attaches a piece of evidence along with its flags', async () => {
    const harness = buildHarness({
      flags: [{ evidenceItemId: 'item-1', type: EvidenceFlagType.MISSING_METADATA } as EvidenceFlag],
    });

    const message = await harness.service.send(ESCROW_ID, buyer, {
      body: 'see this',
      attachmentEvidenceItemId: 'item-1',
    });

    expect(message.attachment?.id).toBe('item-1');
    expect(message.attachment?.flags).toEqual([EvidenceFlagType.MISSING_METADATA]);
    expect(message.attachment?.url).toBe('https://storage.test/evidence/one.jpg');
    expect(harness.getPresignedDownloadUrl).toHaveBeenCalledWith('evidence/one.jpg');
  });

  it('looks the attachment up scoped to the escrow, not by id alone', async () => {
    const harness = buildHarness();

    await harness.service.send(ESCROW_ID, buyer, {
      body: 'see this',
      attachmentEvidenceItemId: 'item-1',
    });

    expect(harness.itemsFindOne).toHaveBeenCalledWith({
      where: { id: 'item-1', escrowId: ESCROW_ID },
    });
  });
});

describe('ChatService.list', () => {
  it('refuses a caller who cannot access the chat', async () => {
    const harness = buildHarness();

    await expect(harness.service.list(ESCROW_ID, stranger)).rejects.toBeInstanceOf(
      NotEscrowPartyError,
    );
  });

  it('returns messages oldest first', async () => {
    const harness = buildHarness({ messages: [buildMessage()] });

    await harness.service.list(ESCROW_ID, buyer);

    expect(harness.messagesFind).toHaveBeenCalledWith({
      where: { escrowId: ESCROW_ID },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
  });

  it('skips the attachment lookup when no message carries one', async () => {
    const harness = buildHarness({ messages: [buildMessage()] });

    const messages = await harness.service.list(ESCROW_ID, buyer);

    expect(harness.itemsFind).not.toHaveBeenCalled();
    expect(messages[0].attachment).toBeNull();
  });

  it('hydrates attachments onto the messages that reference them', async () => {
    const harness = buildHarness({
      messages: [
        buildMessage({ id: 'm1' }),
        buildMessage({ id: 'm2', attachmentEvidenceItemId: 'item-1' }),
      ],
      items: [buildItem()],
    });

    const messages = await harness.service.list(ESCROW_ID, buyer);

    expect(messages[0].attachment).toBeNull();
    expect(messages[1].attachment?.id).toBe('item-1');
    expect(messages[1].attachment?.url).toBe('https://storage.test/evidence/one.jpg');
  });
});

describe('ChatService.getTranscript', () => {
  it('reads the transcript without an access check, for the dispute packet', async () => {
    const harness = buildHarness({ messages: [buildMessage()] });

    const transcript = await harness.service.getTranscript(ESCROW_ID);

    expect(transcript).toHaveLength(1);
    expect(harness.getDetail).not.toHaveBeenCalled();
  });
});

describe('ChatService.markRead', () => {
  it('refuses a caller who cannot access the chat', async () => {
    const harness = buildHarness();

    await expect(harness.service.markRead(ESCROW_ID, stranger)).rejects.toBeInstanceOf(
      NotEscrowPartyError,
    );
  });

  it('records the read watermark for the calling user', async () => {
    const harness = buildHarness();

    const state = await harness.service.markRead(ESCROW_ID, buyer);

    expect(state.userId).toBe(BUYER_ID);
    expect(state.lastReadAt).toBeInstanceOf(Date);
    expect(harness.readsValues).toHaveBeenCalledWith(
      expect.objectContaining({ escrowId: ESCROW_ID, userId: BUYER_ID }),
    );
  });
});

describe('ChatService.getReadState', () => {
  it('refuses a caller who cannot access the chat', async () => {
    const harness = buildHarness();

    await expect(harness.service.getReadState(ESCROW_ID, stranger)).rejects.toBeInstanceOf(
      NotEscrowPartyError,
    );
  });

  it('reports the watermark for every participant', async () => {
    const lastReadAt = new Date('2026-01-02T00:00:00.000Z');
    const harness = buildHarness({
      reads: [
        { escrowId: ESCROW_ID, userId: BUYER_ID, lastReadAt } as ChatRead,
        { escrowId: ESCROW_ID, userId: SELLER_ID, lastReadAt } as ChatRead,
      ],
    });

    const states = await harness.service.getReadState(ESCROW_ID, buyer);

    expect(states).toEqual([
      { userId: BUYER_ID, lastReadAt },
      { userId: SELLER_ID, lastReadAt },
    ]);
  });
});

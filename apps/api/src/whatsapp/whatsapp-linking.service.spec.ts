import { createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { WhatsAppLinkingService } from './whatsapp-linking.service';
import { WhatsAppLinkCodeInvalidError } from './errors/whatsapp-link-code-invalid.error';
import { WhatsAppNumberAlreadyLinkedError } from './errors/whatsapp-number-already-linked.error';
import { FakeWhatsAppClient } from './client/fake-whatsapp.client';
import { WhatsAppLinkCode } from '../database/entities/whatsapp-link-code.entity';
import { WhatsAppAccount } from '../database/entities/whatsapp-account.entity';

function buildLinkCode(overrides: Partial<WhatsAppLinkCode> = {}): WhatsAppLinkCode {
  return {
    id: 'code-1',
    userId: 'user-1',
    phoneNumber: '+2348000000000',
    codeHash: 'hash',
    attempts: 0,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    usedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function buildAccount(overrides: Partial<WhatsAppAccount> = {}): WhatsAppAccount {
  return {
    id: 'account-1',
    userId: 'user-1',
    phoneNumber: '+2348000000000',
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

const CONFIG: Record<string, unknown> = {
  WHATSAPP_LINK_CODE_TTL_MINUTES: 10,
  WHATSAPP_LINK_MAX_ATTEMPTS: 5,
};

type SaveLinkCodeMock = jest.Mock<Promise<WhatsAppLinkCode>, [WhatsAppLinkCode]>;
type SaveAccountMock = jest.Mock<Promise<WhatsAppAccount>, [WhatsAppAccount]>;

interface Harness {
  service: WhatsAppLinkingService;
  linkCodes: { findOne: jest.Mock; create: jest.Mock; save: SaveLinkCodeMock };
  accounts: { findOne: jest.Mock; create: jest.Mock; save: SaveAccountMock };
  client: FakeWhatsAppClient;
}

function buildHarness(): Harness {
  const linkCodes = {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((partial: Partial<WhatsAppLinkCode>) => partial),
    save: jest.fn((entity: WhatsAppLinkCode) => Promise.resolve(entity)) as SaveLinkCodeMock,
  };
  const accounts = {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((partial: Partial<WhatsAppAccount>) => partial),
    save: jest.fn((entity: WhatsAppAccount) => Promise.resolve(entity)) as SaveAccountMock,
  };
  const configService = { getOrThrow: jest.fn((key: string) => CONFIG[key]) };
  const client = new FakeWhatsAppClient();

  const service = new WhatsAppLinkingService(
    linkCodes as unknown as Repository<WhatsAppLinkCode>,
    accounts as unknown as Repository<WhatsAppAccount>,
    configService as unknown as ConfigService,
    client,
  );

  return { service, linkCodes, accounts, client };
}

function hashOf(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

describe('WhatsAppLinkingService.startLink', () => {
  it('sends a 6-digit code over WhatsApp and stores only its hash', async () => {
    const { service, linkCodes, client } = buildHarness();

    await service.startLink('user-1', '+2348000000000');

    expect(client.sent).toHaveLength(1);
    const sentBody = client.sent[0].body;
    const match = /is (\d{6})\./.exec(sentBody);
    expect(match).not.toBeNull();

    const saved = linkCodes.save.mock.calls[0][0];
    expect(saved.codeHash).toBe(hashOf(match![1]));
    expect(saved.codeHash).not.toBe(match![1]);
  });

  it('refuses to start linking a number already verified for another user', async () => {
    const { service, accounts } = buildHarness();
    accounts.findOne.mockResolvedValue(buildAccount({ userId: 'someone-else' }));

    await expect(service.startLink('user-1', '+2348000000000')).rejects.toBeInstanceOf(
      WhatsAppNumberAlreadyLinkedError,
    );
  });

  it('allows re-starting a link for a number the same user already verified', async () => {
    const { service, accounts, client } = buildHarness();
    accounts.findOne.mockResolvedValue(buildAccount({ userId: 'user-1' }));

    await expect(service.startLink('user-1', '+2348000000000')).resolves.toBeUndefined();
    expect(client.sent).toHaveLength(1);
  });
});

describe('WhatsAppLinkingService.confirmLink', () => {
  it('verifies the account and marks the code used on a correct code', async () => {
    const { service, linkCodes, accounts } = buildHarness();
    linkCodes.findOne.mockResolvedValue(buildLinkCode({ codeHash: hashOf('123456') }));

    const account = await service.confirmLink('+2348000000000', '123456');

    expect(account.verifiedAt).toBeInstanceOf(Date);
    const savedCode = linkCodes.save.mock.calls[0][0];
    expect(savedCode.usedAt).toBeInstanceOf(Date);
    expect(accounts.save).toHaveBeenCalled();
  });

  it('rejects a wrong code and records the attempt without linking', async () => {
    const { service, linkCodes, accounts } = buildHarness();
    linkCodes.findOne.mockResolvedValue(buildLinkCode({ codeHash: hashOf('123456'), attempts: 0 }));

    await expect(service.confirmLink('+2348000000000', '000000')).rejects.toBeInstanceOf(
      WhatsAppLinkCodeInvalidError,
    );

    const savedCode = linkCodes.save.mock.calls[0][0];
    expect(savedCode.attempts).toBe(1);
    expect(savedCode.usedAt).toBeNull();
    expect(accounts.save).not.toHaveBeenCalled();
  });

  it('invalidates the code once the max attempt count is reached', async () => {
    const { service, linkCodes } = buildHarness();
    linkCodes.findOne.mockResolvedValue(buildLinkCode({ codeHash: hashOf('123456'), attempts: 4 }));

    await expect(service.confirmLink('+2348000000000', '000000')).rejects.toBeInstanceOf(
      WhatsAppLinkCodeInvalidError,
    );

    const savedCode = linkCodes.save.mock.calls[0][0];
    expect(savedCode.usedAt).toBeInstanceOf(Date);
  });

  it('rejects an expired code', async () => {
    const { service, linkCodes } = buildHarness();
    linkCodes.findOne.mockResolvedValue(
      buildLinkCode({ codeHash: hashOf('123456'), expiresAt: new Date(Date.now() - 1000) }),
    );

    await expect(service.confirmLink('+2348000000000', '123456')).rejects.toBeInstanceOf(
      WhatsAppLinkCodeInvalidError,
    );
  });

  it('rejects when there is no outstanding code for that number', async () => {
    const { service, linkCodes } = buildHarness();
    linkCodes.findOne.mockResolvedValue(null);

    await expect(service.confirmLink('+2348000000000', '123456')).rejects.toBeInstanceOf(
      WhatsAppLinkCodeInvalidError,
    );
  });

  it('rejects a code that was already used', async () => {
    const { service, linkCodes } = buildHarness();
    linkCodes.findOne.mockResolvedValue(
      buildLinkCode({ codeHash: hashOf('123456'), usedAt: new Date() }),
    );

    await expect(service.confirmLink('+2348000000000', '123456')).rejects.toBeInstanceOf(
      WhatsAppLinkCodeInvalidError,
    );
  });
});

describe('WhatsAppLinkingService.setOptedOut', () => {
  it('updates the notifications opt-out timestamp', async () => {
    const { service, accounts } = buildHarness();
    const update = jest.fn().mockResolvedValue({ affected: 1 });
    (accounts as unknown as { update: jest.Mock }).update = update;

    await service.setOptedOut('user-1', true);

    expect(update).toHaveBeenCalledWith(
      { userId: 'user-1' },
      { notificationsOptedOutAt: expect.any(Date) as Date },
    );
  });
});

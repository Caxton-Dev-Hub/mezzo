import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { WhatsAppPinService } from './whatsapp-pin.service';
import { PasswordService } from '../auth/password.service';
import { WhatsAppPinNotSetError } from './errors/whatsapp-pin-not-set.error';
import { WhatsAppPinLockedError } from './errors/whatsapp-pin-locked.error';
import { WhatsAppPinIncorrectError } from './errors/whatsapp-pin-incorrect.error';
import { WhatsAppAccount } from '../database/entities/whatsapp-account.entity';

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
  WHATSAPP_PIN_MAX_ATTEMPTS: 3,
  WHATSAPP_PIN_LOCKOUT_MINUTES: 15,
};

type SaveAccountMock = jest.Mock<Promise<WhatsAppAccount>, [WhatsAppAccount]>;

interface Harness {
  service: WhatsAppPinService;
  accounts: { findOne: jest.Mock; save: SaveAccountMock };
}

function buildHarness(): Harness {
  const accounts = {
    findOne: jest.fn().mockResolvedValue(buildAccount()),
    save: jest.fn((entity: WhatsAppAccount) => Promise.resolve(entity)) as SaveAccountMock,
  };
  const configService = { getOrThrow: jest.fn((key: string) => CONFIG[key]) };
  const passwordService = new PasswordService();

  const service = new WhatsAppPinService(
    accounts as unknown as Repository<WhatsAppAccount>,
    passwordService,
    configService as unknown as ConfigService,
  );

  return { service, accounts };
}

describe('WhatsAppPinService.verify', () => {
  it('throws WhatsAppPinNotSetError when no PIN has been set', async () => {
    const { service } = buildHarness();
    const account = buildAccount({ pinHash: null });

    await expect(service.verify(account, '1234')).rejects.toBeInstanceOf(WhatsAppPinNotSetError);
  });

  it('accepts a correct PIN and resets the failure counter', async () => {
    const { service } = buildHarness();
    const passwordService = new PasswordService();
    const pinHash = await passwordService.hash('1234');
    const account = buildAccount({ pinHash, pinFailedAttempts: 1 });

    await service.verify(account, '1234');

    expect(account.pinFailedAttempts).toBe(0);
    expect(account.pinLockedUntil).toBeNull();
  });

  it('rejects an incorrect PIN and increments the failure counter', async () => {
    const { service } = buildHarness();
    const passwordService = new PasswordService();
    const pinHash = await passwordService.hash('1234');
    const account = buildAccount({ pinHash, pinFailedAttempts: 0 });

    await expect(service.verify(account, '0000')).rejects.toBeInstanceOf(WhatsAppPinIncorrectError);
    expect(account.pinFailedAttempts).toBe(1);
    expect(account.pinLockedUntil).toBeNull();
  });

  it('locks the account after reaching the max consecutive wrong attempts', async () => {
    const { service } = buildHarness();
    const passwordService = new PasswordService();
    const pinHash = await passwordService.hash('1234');
    const account = buildAccount({ pinHash, pinFailedAttempts: 2 });

    await expect(service.verify(account, '0000')).rejects.toBeInstanceOf(WhatsAppPinLockedError);
    expect(account.pinLockedUntil).toBeInstanceOf(Date);
    expect(account.pinFailedAttempts).toBe(0);
  });

  it('refuses to check the PIN at all while locked, without consuming an attempt', async () => {
    const { service } = buildHarness();
    const passwordService = new PasswordService();
    const pinHash = await passwordService.hash('1234');
    const account = buildAccount({
      pinHash,
      pinFailedAttempts: 0,
      pinLockedUntil: new Date(Date.now() + 60_000),
    });

    await expect(service.verify(account, '1234')).rejects.toBeInstanceOf(WhatsAppPinLockedError);
    expect(account.pinFailedAttempts).toBe(0);
  });

  it('allows verification again once the lockout window has passed', async () => {
    const { service } = buildHarness();
    const passwordService = new PasswordService();
    const pinHash = await passwordService.hash('1234');
    const account = buildAccount({
      pinHash,
      pinFailedAttempts: 0,
      pinLockedUntil: new Date(Date.now() - 1000),
    });

    await expect(service.verify(account, '1234')).resolves.toBeUndefined();
  });
});

describe('WhatsAppPinService.setPin', () => {
  it('hashes and stores the PIN, clearing any prior lock state', async () => {
    const { service, accounts } = buildHarness();
    accounts.findOne.mockResolvedValue(
      buildAccount({ pinFailedAttempts: 2, pinLockedUntil: new Date() }),
    );

    await service.setPin('user-1', '4321');

    const saved = accounts.save.mock.calls[0][0];
    expect(saved.pinHash).not.toBe('4321');
    expect(saved.pinFailedAttempts).toBe(0);
    expect(saved.pinLockedUntil).toBeNull();
  });
});

import { randomBytes } from 'node:crypto';
import { Repository } from 'typeorm';
import { StellarAccount } from '../database/entities/stellar-account.entity';
import { StellarWalletService } from './stellar-wallet.service';
import { StellarConfigService } from './stellar-config.service';
import { encodeStellarAccountId } from './stellar-account-id';
import { InvalidStellarAccountError } from './errors/invalid-stellar-account.error';
import { StellarAccountNotLinkedError } from './errors/stellar-account-not-linked.error';
import { StellarRailDisabledError } from './errors/stellar-rail-disabled.error';

const USER_ID = 'user-1';
const ACCOUNT_ID = encodeStellarAccountId(randomBytes(32));

interface Harness {
  service: StellarWalletService;
  findOne: jest.Mock;
  save: jest.Mock;
  remove: jest.Mock;
}

function buildHarness(options: { enabled?: boolean; existing?: Partial<StellarAccount> } = {}): Harness {
  const findOne = jest.fn().mockResolvedValue(options.existing ?? null);
  const save = jest.fn().mockImplementation((account: StellarAccount) => Promise.resolve(account));
  const remove = jest.fn().mockResolvedValue({ affected: 1 });
  const accounts = {
    findOne,
    save,
    delete: remove,
    create: (values: Partial<StellarAccount>) => ({ ...values }) as StellarAccount,
  } as unknown as Repository<StellarAccount>;

  const enabled = options.enabled ?? true;
  const stellarConfig = {
    isEnabled: () => enabled,
    assertEnabled: () => {
      if (!enabled) {
        throw new StellarRailDisabledError();
      }
    },
    networkName: 'testnet',
  } as unknown as StellarConfigService;

  return { service: new StellarWalletService(accounts, stellarConfig), findOne, save, remove };
}

describe('StellarWalletService', () => {
  it('links a valid account id to the configured network', async () => {
    const harness = buildHarness();

    const account = await harness.service.link(USER_ID, ` ${ACCOUNT_ID} `);

    expect(account.accountId).toBe(ACCOUNT_ID);
    expect(account.network).toBe('testnet');
    expect(account.userId).toBe(USER_ID);
    expect(harness.save).toHaveBeenCalledTimes(1);
  });

  it('replaces the account already linked on that network rather than adding a second', async () => {
    const existing = { id: 'link-1', userId: USER_ID, network: 'testnet', accountId: 'GOLD' };
    const harness = buildHarness({ existing: existing as Partial<StellarAccount> });

    const account = await harness.service.link(USER_ID, ACCOUNT_ID);

    expect(account.id).toBe('link-1');
    expect(account.accountId).toBe(ACCOUNT_ID);
  });

  it('rejects an account id that fails the StrKey checksum', async () => {
    const harness = buildHarness();

    await expect(harness.service.link(USER_ID, `G${'A'.repeat(55)}`)).rejects.toThrow(
      InvalidStellarAccountError,
    );
    expect(harness.save).not.toHaveBeenCalled();
  });

  it('refuses to link while the rail is off', async () => {
    const harness = buildHarness({ enabled: false });

    await expect(harness.service.link(USER_ID, ACCOUNT_ID)).rejects.toThrow(StellarRailDisabledError);
  });

  it('throws a typed error when a party has no linked wallet', async () => {
    const harness = buildHarness();

    await expect(harness.service.findOrThrow(USER_ID)).rejects.toThrow(StellarAccountNotLinkedError);
  });

  it('unlinks only the current network', async () => {
    const harness = buildHarness();

    await harness.service.unlink(USER_ID);

    expect(harness.remove).toHaveBeenCalledWith({ userId: USER_ID, network: 'testnet' });
  });
});

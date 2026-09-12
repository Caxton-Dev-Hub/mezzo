import { randomBytes } from 'node:crypto';
import { Keypair } from '@stellar/stellar-sdk';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { StellarAccount } from '../database/entities/stellar-account.entity';
import { RedisService } from '../redis/redis.service';
import { StellarWalletService } from './stellar-wallet.service';
import { StellarConfigService } from './stellar-config.service';
import { StellarLinkChallengeService } from './stellar-link-challenge.service';
import { encodeStellarAccountId } from './stellar-account-id';
import { InvalidStellarAccountError } from './errors/invalid-stellar-account.error';
import { StellarAccountNotLinkedError } from './errors/stellar-account-not-linked.error';
import { StellarLinkChallengeNotFoundError } from './errors/stellar-link-challenge-not-found.error';
import { StellarRailDisabledError } from './errors/stellar-rail-disabled.error';
import { StellarSignatureInvalidError } from './errors/stellar-signature-invalid.error';

const USER_ID = 'user-1';

interface Harness {
  service: StellarWalletService;
  challenges: StellarLinkChallengeService;
  findOne: jest.Mock;
  save: jest.Mock;
  remove: jest.Mock;
}

function buildHarness(
  options: { enabled?: boolean; existing?: Partial<StellarAccount> } = {},
): Harness {
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

  const store = new Map<string, string>();
  const redis = {
    set: (key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve('OK');
    },
    getdel: (key: string) => {
      const value = store.get(key) ?? null;
      store.delete(key);
      return Promise.resolve(value);
    },
  } as unknown as RedisService;

  const configService = {
    getOrThrow: () => 'http://localhost:3001',
  } as unknown as ConfigService;

  const challenges = new StellarLinkChallengeService(redis, configService, stellarConfig);

  return {
    service: new StellarWalletService(accounts, stellarConfig, challenges),
    challenges,
    findOne,
    save,
    remove,
  };
}

async function linkSigned(
  harness: Harness,
  keypair: Keypair,
  options: { accountId?: string; signWith?: Keypair } = {},
): Promise<StellarAccount> {
  const accountId = options.accountId ?? keypair.publicKey();
  const challenge = await harness.service.createChallenge(USER_ID, accountId);
  const signature = (options.signWith ?? keypair)
    .sign(Buffer.from(challenge.message, 'utf8'))
    .toString('base64');

  return harness.service.link(USER_ID, accountId, signature);
}

describe('StellarWalletService', () => {
  it('links an account whose owner signed the challenge', async () => {
    const harness = buildHarness();
    const keypair = Keypair.random();

    const account = await linkSigned(harness, keypair);

    expect(account.accountId).toBe(keypair.publicKey());
    expect(account.network).toBe('testnet');
    expect(account.userId).toBe(USER_ID);
    expect(harness.save).toHaveBeenCalledTimes(1);
  });

  it('replaces the account already linked on that network rather than adding a second', async () => {
    const existing = { id: 'link-1', userId: USER_ID, network: 'testnet', accountId: 'GOLD' };
    const harness = buildHarness({ existing: existing as Partial<StellarAccount> });
    const keypair = Keypair.random();

    const account = await linkSigned(harness, keypair);

    expect(account.id).toBe('link-1');
    expect(account.accountId).toBe(keypair.publicKey());
  });

  it('rejects an account id that fails the StrKey checksum', async () => {
    const harness = buildHarness();

    await expect(harness.service.link(USER_ID, `G${'A'.repeat(55)}`, 'sig')).rejects.toThrow(
      InvalidStellarAccountError,
    );
    expect(harness.save).not.toHaveBeenCalled();
  });

  it('refuses to link while the rail is off', async () => {
    const harness = buildHarness({ enabled: false });
    const keypair = Keypair.random();

    await expect(harness.service.link(USER_ID, keypair.publicKey(), 'sig')).rejects.toThrow(
      StellarRailDisabledError,
    );
  });

  it('refuses to issue a challenge while the rail is off', async () => {
    const harness = buildHarness({ enabled: false });

    await expect(
      harness.service.createChallenge(USER_ID, Keypair.random().publicKey()),
    ).rejects.toThrow(StellarRailDisabledError);
  });

  it('rejects a signature made by a different keypair', async () => {
    const harness = buildHarness();
    const keypair = Keypair.random();

    await expect(linkSigned(harness, keypair, { signWith: Keypair.random() })).rejects.toThrow(
      StellarSignatureInvalidError,
    );
    expect(harness.save).not.toHaveBeenCalled();
  });

  it('rejects a link attempt for which no challenge was issued', async () => {
    const harness = buildHarness();
    const keypair = Keypair.random();

    await expect(
      harness.service.link(USER_ID, keypair.publicKey(), 'c2lnbmF0dXJl'),
    ).rejects.toThrow(StellarLinkChallengeNotFoundError);
  });

  it('spends a challenge exactly once, so a signature cannot be replayed', async () => {
    const harness = buildHarness();
    const keypair = Keypair.random();
    const challenge = await harness.service.createChallenge(USER_ID, keypair.publicKey());
    const signature = keypair.sign(Buffer.from(challenge.message, 'utf8')).toString('base64');

    await harness.service.link(USER_ID, keypair.publicKey(), signature);

    await expect(harness.service.link(USER_ID, keypair.publicKey(), signature)).rejects.toThrow(
      StellarLinkChallengeNotFoundError,
    );
    expect(harness.save).toHaveBeenCalledTimes(1);
  });

  it('refuses a signature against a challenge issued for another account', async () => {
    const harness = buildHarness();
    const keypair = Keypair.random();
    const other = encodeStellarAccountId(randomBytes(32));
    const challenge = await harness.service.createChallenge(USER_ID, keypair.publicKey());
    const signature = keypair.sign(Buffer.from(challenge.message, 'utf8')).toString('base64');

    await expect(harness.service.link(USER_ID, other, signature)).rejects.toThrow(
      StellarLinkChallengeNotFoundError,
    );
  });

  it('binds the challenge text to the account, the user and the network', async () => {
    const harness = buildHarness();
    const keypair = Keypair.random();

    const challenge = await harness.service.createChallenge(USER_ID, keypair.publicKey());

    expect(challenge.accountId).toBe(keypair.publicKey());
    expect(challenge.message).toContain(keypair.publicKey());
    expect(challenge.message).toContain(USER_ID);
    expect(challenge.message).toContain('testnet');
    expect(challenge.message).toMatch(/Nonce: [0-9a-f]{32}/);
    expect(challenge.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('issues a different nonce on every challenge', async () => {
    const harness = buildHarness();
    const keypair = Keypair.random();

    const first = await harness.service.createChallenge(USER_ID, keypair.publicKey());
    const second = await harness.service.createChallenge(USER_ID, keypair.publicKey());

    expect(first.message).not.toBe(second.message);
  });

  it('throws a typed error when a party has no linked wallet', async () => {
    const harness = buildHarness();

    await expect(harness.service.findOrThrow(USER_ID)).rejects.toThrow(
      StellarAccountNotLinkedError,
    );
  });

  it('unlinks only the current network', async () => {
    const harness = buildHarness();

    await harness.service.unlink(USER_ID);

    expect(harness.remove).toHaveBeenCalledWith({ userId: USER_ID, network: 'testnet' });
  });
});

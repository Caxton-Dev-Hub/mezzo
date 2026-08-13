import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ProfileService } from './profile.service';
import { InvalidAvatarKeyError } from './errors/invalid-avatar-key.error';
import { AvatarMimeMismatchError } from './errors/avatar-mime-mismatch.error';
import { UserRole } from './entities/user-role.enum';
import { User } from '../database/entities/user.entity';
import { EscrowParty } from '../database/entities/escrow-party.entity';
import { EscrowState } from '../escrow/entities/escrow-state.enum';
import { StorageProvider } from '../evidence/storage/storage-provider.interface';
import { KycTier } from '../kyc/entities/kyc-tier.enum';

const USER_ID = 'user-1';

jest.mock('file-type', () => ({
  fromBuffer: jest.fn(),
}));

import { fromBuffer as fileTypeFromBuffer } from 'file-type';

const mockedFromBuffer = fileTypeFromBuffer as unknown as jest.Mock;

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: USER_ID,
    email: 'seller@example.com',
    passwordHash: 'argon2-hash',
    googleSub: null,
    phone: null,
    role: UserRole.USER,
    kycTier: KycTier.TIER_1,
    businessName: null,
    bio: null,
    location: null,
    avatarKey: null,
    emailVerifiedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

interface Harness {
  service: ProfileService;
  usersFindOne: jest.Mock;
  usersSave: jest.Mock;
  getCount: jest.Mock;
  presignUpload: jest.Mock;
  presignDownload: jest.Mock;
  getObject: jest.Mock;
  deleteObject: jest.Mock;
  whereSpy: jest.Mock;
}

function buildHarness(
  options: { user?: User | null; completedEscrows?: number; buffer?: Buffer } = {},
): Harness {
  const usersFindOne = jest
    .fn()
    .mockResolvedValue(options.user === undefined ? buildUser() : options.user);
  const usersSave = jest.fn().mockImplementation((row) => Promise.resolve(row));
  const users = { findOne: usersFindOne, save: usersSave } as unknown as Repository<User>;

  const getCount = jest.fn().mockResolvedValue(options.completedEscrows ?? 0);
  const whereSpy = jest.fn();
  const builder = {
    innerJoin: () => builder,
    where: (clause: string, params: unknown) => {
      whereSpy(clause, params);
      return builder;
    },
    andWhere: (clause: string, params: unknown) => {
      whereSpy(clause, params);
      return builder;
    },
    getCount,
  };
  const parties = {
    createQueryBuilder: () => builder,
  } as unknown as Repository<EscrowParty>;

  const presignUpload = jest.fn().mockResolvedValue('https://upload.example/put');
  const presignDownload = jest.fn().mockResolvedValue('https://cdn.example/avatar.png');
  const getObject = jest.fn().mockResolvedValue(options.buffer ?? Buffer.from('png-bytes'));
  const deleteObject = jest.fn().mockResolvedValue(undefined);
  const storage = {
    getPresignedUploadUrl: presignUpload,
    getPresignedDownloadUrl: presignDownload,
    getObject,
    deleteObject,
  } as unknown as StorageProvider;

  return {
    service: new ProfileService(users, parties, storage),
    usersFindOne,
    usersSave,
    getCount,
    presignUpload,
    presignDownload,
    getObject,
    deleteObject,
    whereSpy,
  };
}

beforeEach(() => {
  mockedFromBuffer.mockReset();
  mockedFromBuffer.mockResolvedValue({ mime: 'image/png', ext: 'png' });
});

describe('ProfileService.getOwnProfile', () => {
  it('throws NotFoundException for an unknown user', async () => {
    const harness = buildHarness({ user: null });

    await expect(harness.service.getOwnProfile(USER_ID)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns the profile with no avatar url when none is set', async () => {
    const harness = buildHarness();

    const profile = await harness.service.getOwnProfile(USER_ID);

    expect(profile.avatarUrl).toBeNull();
    expect(harness.presignDownload).not.toHaveBeenCalled();
  });

  it('resolves a viewable avatar url when one is set', async () => {
    const harness = buildHarness({ user: buildUser({ avatarKey: 'avatars/user-1/a.png' }) });

    const profile = await harness.service.getOwnProfile(USER_ID);

    expect(harness.presignDownload).toHaveBeenCalledWith('avatars/user-1/a.png');
    expect(profile.avatarUrl).toBe('https://cdn.example/avatar.png');
  });

  it('counts only released escrows towards the completed total', async () => {
    const harness = buildHarness({ completedEscrows: 4 });

    const profile = await harness.service.getOwnProfile(USER_ID);

    expect(profile.completedEscrows).toBe(4);
    expect(harness.whereSpy).toHaveBeenCalledWith('escrow.state = :state', {
      state: EscrowState.RELEASED,
    });
  });
});

describe('ProfileService.getPublicProfile', () => {
  it('throws NotFoundException for an unknown user', async () => {
    const harness = buildHarness({ user: null });

    await expect(harness.service.getPublicProfile(USER_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('does not leak the account email to the public view', async () => {
    const harness = buildHarness();

    const profile = await harness.service.getPublicProfile(USER_ID);

    expect(profile).not.toHaveProperty('email');
    expect(profile.id).toBe(USER_ID);
  });
});

describe('ProfileService.update', () => {
  it('writes the editable profile fields through', async () => {
    const user = buildUser();
    const harness = buildHarness({ user });

    await harness.service.update(USER_ID, {
      businessName: 'Acme Traders',
      bio: 'We sell lenses.',
      location: 'Lagos',
    });

    expect(user.businessName).toBe('Acme Traders');
    expect(user.bio).toBe('We sell lenses.');
    expect(user.location).toBe('Lagos');
    expect(harness.usersSave).toHaveBeenCalledWith(user);
  });

  it('throws NotFoundException for an unknown user', async () => {
    const harness = buildHarness({ user: null });

    await expect(
      harness.service.update(USER_ID, { businessName: null, bio: null, location: null }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ProfileService.presignAvatar', () => {
  it('namespaces the upload key under the owning user', async () => {
    const harness = buildHarness();

    const { key } = await harness.service.presignAvatar(USER_ID, { mimeType: 'image/png' });

    expect(key.startsWith(`avatars/${USER_ID}/`)).toBe(true);
    expect(harness.presignUpload).toHaveBeenCalledWith(key, 'image/png');
  });
});

describe('ProfileService.confirmAvatar', () => {
  const dto = { key: `avatars/${USER_ID}/new.png`, declaredMime: 'image/png' as const };

  it('refuses a key belonging to another user', async () => {
    const harness = buildHarness();

    await expect(
      harness.service.confirmAvatar(USER_ID, { ...dto, key: 'avatars/someone-else/new.png' }),
    ).rejects.toBeInstanceOf(InvalidAvatarKeyError);
    expect(harness.getObject).not.toHaveBeenCalled();
  });

  it('rejects and deletes an upload whose real type differs from the declared one', async () => {
    const harness = buildHarness();
    mockedFromBuffer.mockResolvedValue({ mime: 'application/zip', ext: 'zip' });

    await expect(harness.service.confirmAvatar(USER_ID, dto)).rejects.toBeInstanceOf(
      AvatarMimeMismatchError,
    );
    expect(harness.deleteObject).toHaveBeenCalledWith(dto.key);
  });

  it('rejects an upload whose type could not be detected', async () => {
    const harness = buildHarness();
    mockedFromBuffer.mockResolvedValue(undefined);

    await expect(harness.service.confirmAvatar(USER_ID, dto)).rejects.toBeInstanceOf(
      AvatarMimeMismatchError,
    );
  });

  it('rejects an avatar larger than the five megabyte cap', async () => {
    const harness = buildHarness({ buffer: Buffer.alloc(5 * 1024 * 1024 + 1) });

    await expect(harness.service.confirmAvatar(USER_ID, dto)).rejects.toBeInstanceOf(
      AvatarMimeMismatchError,
    );
    expect(harness.deleteObject).toHaveBeenCalledWith(dto.key);
  });

  it('stores the new avatar key on the user', async () => {
    const user = buildUser();
    const harness = buildHarness({ user });

    await harness.service.confirmAvatar(USER_ID, dto);

    expect(user.avatarKey).toBe(dto.key);
    expect(harness.usersSave).toHaveBeenCalledWith(user);
  });

  it('cleans up the previous avatar object it replaced', async () => {
    const harness = buildHarness({ user: buildUser({ avatarKey: 'avatars/user-1/old.png' }) });

    await harness.service.confirmAvatar(USER_ID, dto);

    expect(harness.deleteObject).toHaveBeenCalledWith('avatars/user-1/old.png');
  });

  it('does not delete anything when the user had no avatar before', async () => {
    const harness = buildHarness();

    await harness.service.confirmAvatar(USER_ID, dto);

    expect(harness.deleteObject).not.toHaveBeenCalled();
  });

  it('survives a storage cleanup failure without failing the upload', async () => {
    const harness = buildHarness({ user: buildUser({ avatarKey: 'avatars/user-1/old.png' }) });
    harness.deleteObject.mockRejectedValue(new Error('storage down'));

    await expect(harness.service.confirmAvatar(USER_ID, dto)).resolves.toEqual(
      expect.objectContaining({ id: USER_ID }),
    );
  });
});

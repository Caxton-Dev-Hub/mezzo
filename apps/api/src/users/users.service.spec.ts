import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { UsersService } from './users.service';
import { User } from '../database/entities/user.entity';
import { UserRole } from './entities/user-role.enum';
import { UserStatus } from './entities/user-status.enum';
import { KycTier } from '../kyc/entities/kyc-tier.enum';

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'buyer@example.com',
    passwordHash: 'argon2-hash',
    googleSub: null,
    phone: null,
    role: UserRole.USER,
    status: UserStatus.ACTIVE,
    kycTier: KycTier.TIER_0,
    businessName: null,
    bio: null,
    location: null,
    avatarKey: null,
    emailVerifiedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

class InMemoryUserRepository {
  readonly rows: User[] = [];

  findOne({ where }: { where: Partial<User> }): Promise<User | null> {
    const match = this.rows.find((row) =>
      Object.entries(where).every(([key, value]) => row[key as keyof User] === value),
    );
    return Promise.resolve(match ?? null);
  }

  create(entity: Partial<User>): User {
    return buildUser({ ...entity, id: `user-${this.rows.length + 1}` });
  }

  save(entity: User): Promise<User> {
    const index = this.rows.findIndex((row) => row.id === entity.id);
    if (index >= 0) {
      this.rows[index] = entity;
    } else {
      this.rows.push(entity);
    }
    return Promise.resolve(entity);
  }
}

function buildUsersService(bootstrapAdminEmails = ''): {
  usersService: UsersService;
  repository: InMemoryUserRepository;
} {
  const repository = new InMemoryUserRepository();
  const configService = {
    get: () => bootstrapAdminEmails,
  } as unknown as ConfigService;

  return {
    usersService: new UsersService(repository as unknown as Repository<User>, configService),
    repository,
  };
}

describe('UsersService.linkOrCreateGoogleUser', () => {
  it('creates a passwordless account for a first-time Google user', async () => {
    const { usersService } = buildUsersService();

    const user = await usersService.linkOrCreateGoogleUser('google-1', 'New.User@Example.com');

    expect(user.email).toBe('new.user@example.com');
    expect(user.googleSub).toBe('google-1');
    expect(user.passwordHash).toBeNull();
    expect(user.role).toBe(UserRole.USER);
  });

  it('links Google to an existing password account with the same email', async () => {
    const { usersService, repository } = buildUsersService();
    repository.rows.push(buildUser({ email: 'buyer@example.com', passwordHash: 'argon2-hash' }));

    const user = await usersService.linkOrCreateGoogleUser('google-1', 'Buyer@Example.com');

    expect(user.id).toBe('user-1');
    expect(user.googleSub).toBe('google-1');
    expect(user.passwordHash).toBe('argon2-hash');
    expect(repository.rows).toHaveLength(1);
  });

  it('returns the same account on repeat sign-in without duplicating it', async () => {
    const { usersService, repository } = buildUsersService();

    const first = await usersService.linkOrCreateGoogleUser('google-1', 'buyer@example.com');
    const second = await usersService.linkOrCreateGoogleUser('google-1', 'buyer@example.com');

    expect(second.id).toBe(first.id);
    expect(repository.rows).toHaveLength(1);
  });

  it('follows the Google subject when the account email has since changed', async () => {
    const { usersService, repository } = buildUsersService();
    repository.rows.push(buildUser({ email: 'old@example.com', googleSub: 'google-1' }));

    const user = await usersService.linkOrCreateGoogleUser('google-1', 'new@example.com');

    expect(user.id).toBe('user-1');
    expect(user.email).toBe('old@example.com');
    expect(repository.rows).toHaveLength(1);
  });

  it('grants admin to a bootstrap email arriving through Google', async () => {
    const { usersService } = buildUsersService('admin@mezzo.app');

    const user = await usersService.linkOrCreateGoogleUser('google-1', 'Admin@Mezzo.app');

    expect(user.role).toBe(UserRole.ADMIN);
  });
});

describe('UsersService.updateRole', () => {
  it('changes the role and reports the before/after values', async () => {
    const { usersService, repository } = buildUsersService();
    repository.rows.push(buildUser({ id: 'user-1', role: UserRole.USER }));

    const result = await usersService.updateRole('user-1', UserRole.ARBITER);

    expect(result).toEqual({ before: UserRole.USER, after: UserRole.ARBITER });
    expect(repository.rows[0].role).toBe(UserRole.ARBITER);
  });

  it('throws when the user does not exist', async () => {
    const { usersService } = buildUsersService();

    await expect(usersService.updateRole('missing', UserRole.ADMIN)).rejects.toThrow(
      'User not found',
    );
  });
});

describe('UsersService.updateStatus', () => {
  it('suspends an active user and reports the before/after values', async () => {
    const { usersService, repository } = buildUsersService();
    repository.rows.push(buildUser({ id: 'user-1', status: UserStatus.ACTIVE }));

    const result = await usersService.updateStatus('user-1', UserStatus.SUSPENDED);

    expect(result).toEqual({ before: UserStatus.ACTIVE, after: UserStatus.SUSPENDED });
    expect(repository.rows[0].status).toBe(UserStatus.SUSPENDED);
  });

  it('throws when the user does not exist', async () => {
    const { usersService } = buildUsersService();

    await expect(usersService.updateStatus('missing', UserStatus.SUSPENDED)).rejects.toThrow(
      'User not found',
    );
  });
});

describe('UsersService.getById', () => {
  it('returns the user when found', async () => {
    const { usersService, repository } = buildUsersService();
    repository.rows.push(buildUser({ id: 'user-1' }));

    const user = await usersService.getById('user-1');

    expect(user.id).toBe('user-1');
  });

  it('throws NotFoundException when missing', async () => {
    const { usersService } = buildUsersService();

    await expect(usersService.getById('missing')).rejects.toThrow('User not found');
  });
});

import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import { TokenService } from './token.service';
import { RefreshToken } from '../database/entities/refresh-token.entity';
import { User } from '../database/entities/user.entity';
import { UserRole } from '../users/entities/user-role.enum';
import { KycTier } from '../kyc/entities/kyc-tier.enum';
import { InvalidRefreshTokenError } from './errors/invalid-refresh-token.error';
import { RefreshTokenReusedError } from './errors/refresh-token-reused.error';

interface FindOneArgs {
  where: { id?: string };
}

interface UpdateArgs {
  familyId: string;
}

class InMemoryRefreshTokenRepository {
  private readonly rows = new Map<string, RefreshToken>();

  create(entity: Partial<RefreshToken>): RefreshToken {
    return entity as RefreshToken;
  }

  save(entity: RefreshToken): Promise<RefreshToken> {
    this.rows.set(entity.id, { ...entity });
    return Promise.resolve(entity);
  }

  findOne({ where }: FindOneArgs): Promise<RefreshToken | null> {
    return Promise.resolve(where.id ? (this.rows.get(where.id) ?? null) : null);
  }

  update(criteria: UpdateArgs, partial: Partial<RefreshToken>): Promise<void> {
    for (const row of this.rows.values()) {
      if (row.familyId === criteria.familyId) {
        Object.assign(row, partial);
      }
    }
    return Promise.resolve();
  }
}

class InMemoryUserRepository {
  constructor(private readonly users: Map<string, User>) { }

  findOne({ where }: { where: { id: string } }): Promise<User | null> {
    return Promise.resolve(this.users.get(where.id) ?? null);
  }
}

function buildTokenService(user: User): TokenService {
  const users = new Map<string, User>([[user.id, user]]);
  const refreshRepo = new InMemoryRefreshTokenRepository() as unknown as Repository<RefreshToken>;
  const userRepo = new InMemoryUserRepository(users) as unknown as Repository<User>;

  const configValues: Record<string, string | number> = {
    JWT_ACCESS_SECRET: 'access-secret-for-unit-tests-32-chars!!',
    JWT_REFRESH_SECRET: 'refresh-secret-for-unit-tests-32-chars!',
    JWT_ACCESS_TTL_SECONDS: 900,
    JWT_REFRESH_TTL_SECONDS: 2_592_000,
  };
  const configService = {
    getOrThrow: <T>(key: string): T => configValues[key] as T,
  } as unknown as ConfigService;

  return new TokenService(refreshRepo, userRepo, new JwtService(), configService);
}

describe('TokenService', () => {
  const user: User = {
    id: randomUUID(),
    email: 'user@example.com',
    passwordHash: 'irrelevant',
    phone: null,
    role: UserRole.USER,
    kycTier: KycTier.TIER_0,
    businessName: null,
    bio: null,
    location: null,
    avatarKey: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('issues an access and refresh token pair', async () => {
    const tokenService = buildTokenService(user);
    const pair = await tokenService.issueTokenPair(user);

    expect(typeof pair.accessToken).toBe('string');
    expect(typeof pair.refreshToken).toBe('string');
    expect(pair.accessToken).not.toBe(pair.refreshToken);
  });

  it('rotates the refresh token, invalidating the previous one', async () => {
    const tokenService = buildTokenService(user);
    const first = await tokenService.issueTokenPair(user);
    const rotated = await tokenService.rotate(first.refreshToken);

    expect(rotated.refreshToken).not.toBe(first.refreshToken);
    expect(rotated.userId).toBe(user.id);
  });

  it('detects reuse of an already-used refresh token and revokes the whole family', async () => {
    const tokenService = buildTokenService(user);
    const first = await tokenService.issueTokenPair(user);
    const rotated = await tokenService.rotate(first.refreshToken);

    await expect(tokenService.rotate(first.refreshToken)).rejects.toBeInstanceOf(
      RefreshTokenReusedError,
    );

    await expect(tokenService.rotate(rotated.refreshToken)).rejects.toBeInstanceOf(
      RefreshTokenReusedError,
    );
  });

  it('rejects a refresh token with an invalid signature', async () => {
    const tokenService = buildTokenService(user);

    await expect(tokenService.rotate('not-a-real-token')).rejects.toBeInstanceOf(
      InvalidRefreshTokenError,
    );
  });
});

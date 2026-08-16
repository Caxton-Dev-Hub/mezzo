import { randomUUID, createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { IsNull, Repository } from 'typeorm';
import { RefreshToken } from '../database/entities/refresh-token.entity';
import { User } from '../database/entities/user.entity';
import { UserRole } from '../users/entities/user-role.enum';
import { UserStatus } from '../users/entities/user-status.enum';
import { InvalidRefreshTokenError } from './errors/invalid-refresh-token.error';
import { RefreshTokenReusedError } from './errors/refresh-token-reused.error';
import { UserSuspendedError } from './errors/user-suspended.error';

interface AccessTokenPayload {
  sub: string;
  role: UserRole;
}

interface RefreshTokenPayload {
  sub: string;
  jti: string;
  familyId: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class TokenService {
  constructor(
    @InjectRepository(RefreshToken)
    private readonly refreshTokens: Repository<RefreshToken>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async issueTokenPair(user: User): Promise<TokenPair> {
    return this.issueTokenPairForFamily(user, randomUUID());
  }

  async rotate(presentedToken: string): Promise<TokenPair & { userId: string }> {
    const payload = this.verifyRefreshToken(presentedToken);
    const record = await this.refreshTokens.findOne({ where: { id: payload.jti } });

    if (!record || record.tokenHash !== this.hashToken(presentedToken)) {
      throw new InvalidRefreshTokenError();
    }

    if (record.revokedAt) {
      await this.refreshTokens.update({ familyId: record.familyId }, { revokedAt: new Date() });
      throw new RefreshTokenReusedError();
    }

    if (record.expiresAt.getTime() < Date.now()) {
      throw new InvalidRefreshTokenError();
    }

    const user = await this.users.findOne({ where: { id: record.userId } });
    if (!user) {
      throw new InvalidRefreshTokenError();
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw new UserSuspendedError();
    }

    record.revokedAt = new Date();
    await this.refreshTokens.save(record);

    const pair = await this.issueTokenPairForFamily(user, record.familyId);

    return { ...pair, userId: record.userId };
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.refreshTokens.update({ userId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  private async issueTokenPairForFamily(user: User, familyId: string): Promise<TokenPair> {
    const jti = randomUUID();
    const accessTtlSeconds = this.configService.getOrThrow<number>('JWT_ACCESS_TTL_SECONDS');
    const refreshTtlSeconds = this.configService.getOrThrow<number>('JWT_REFRESH_TTL_SECONDS');

    const accessPayload: AccessTokenPayload = { sub: user.id, role: user.role };
    const accessToken = await this.jwtService.signAsync(accessPayload, {
      secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: accessTtlSeconds,
    });

    const refreshPayload: RefreshTokenPayload = { sub: user.id, jti, familyId };
    const refreshToken = await this.jwtService.signAsync(refreshPayload, {
      secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: refreshTtlSeconds,
    });

    const record = this.refreshTokens.create({
      id: jti,
      userId: user.id,
      familyId,
      tokenHash: this.hashToken(refreshToken),
      expiresAt: new Date(Date.now() + refreshTtlSeconds * 1000),
      revokedAt: null,
    });
    await this.refreshTokens.save(record);

    return { accessToken, refreshToken };
  }

  private verifyRefreshToken(token: string): RefreshTokenPayload {
    try {
      return this.jwtService.verify<RefreshTokenPayload>(token, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new InvalidRefreshTokenError();
    }
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}

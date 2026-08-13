import { createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { PasswordResetService } from './password-reset.service';
import { PasswordService } from './password.service';
import { FakePasswordResetMailer } from './mailers/fake-password-reset.mailer';
import { InvalidPasswordResetTokenError } from './errors/invalid-password-reset-token.error';
import { PasswordResetToken } from '../database/entities/password-reset-token.entity';
import { RefreshToken } from '../database/entities/refresh-token.entity';
import { User } from '../database/entities/user.entity';
import { UserRole } from '../users/entities/user-role.enum';
import { KycTier } from '../kyc/entities/kyc-tier.enum';

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'buyer@example.com',
    passwordHash: 'argon2-old-hash',
    googleSub: null,
    phone: null,
    role: UserRole.USER,
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

function buildResetToken(overrides: Partial<PasswordResetToken> = {}): PasswordResetToken {
  return {
    id: 'reset-1',
    userId: 'user-1',
    tokenHash: 'hash',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    usedAt: null,
    createdAt: new Date(),
    ...overrides,
  } as PasswordResetToken;
}

const CONFIG: Record<string, unknown> = {
  PASSWORD_RESET_TOKEN_TTL_MINUTES: 60,
  WEB_APP_URL: 'https://app.mezzo.test',
};

type SaveResetTokenMock = jest.Mock<Promise<PasswordResetToken>, [PasswordResetToken]>;

interface Harness {
  service: PasswordResetService;
  resetTokens: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: SaveResetTokenMock;
    update: jest.Mock;
  };
  refreshTokens: { update: jest.Mock };
  users: { findOne: jest.Mock; save: jest.Mock };
  passwordService: { hash: jest.Mock };
  mailer: FakePasswordResetMailer;
}

function buildHarness(): Harness {
  const resetTokens = {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((partial: Partial<PasswordResetToken>) => partial),
    save: jest.fn((entity: PasswordResetToken) => Promise.resolve(entity)) as SaveResetTokenMock,
    update: jest.fn().mockResolvedValue(undefined),
  };
  const refreshTokens = { update: jest.fn().mockResolvedValue(undefined) };
  const users = {
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn((entity: User) => Promise.resolve(entity)),
  };
  const passwordService = { hash: jest.fn().mockResolvedValue('argon2-new-hash') };
  const configService = { getOrThrow: jest.fn((key: string) => CONFIG[key]) };
  const mailer = new FakePasswordResetMailer();

  const service = new PasswordResetService(
    resetTokens as unknown as Repository<PasswordResetToken>,
    refreshTokens as unknown as Repository<RefreshToken>,
    users as unknown as Repository<User>,
    passwordService as unknown as PasswordService,
    configService as unknown as ConfigService,
    mailer,
  );

  return { service, resetTokens, refreshTokens, users, passwordService, mailer };
}

function hashOf(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function tokenFromResetUrl(resetUrl: string): string {
  return new URL(resetUrl).searchParams.get('token') ?? '';
}

describe('PasswordResetService', () => {
  describe('request', () => {
    it('stores only a hash of the emailed token', async () => {
      const { service, resetTokens, users, mailer } = buildHarness();
      users.findOne.mockResolvedValue(buildUser());

      await service.request({ email: 'buyer@example.com' });

      expect(mailer.sent).toHaveLength(1);
      const emailedToken = tokenFromResetUrl(mailer.sent[0].resetUrl);
      expect(emailedToken).not.toBe('');

      const saved = resetTokens.save.mock.calls[0][0];
      expect(saved.tokenHash).toBe(hashOf(emailedToken));
      expect(saved.tokenHash).not.toBe(emailedToken);
    });

    it('invalidates any outstanding token for the user before issuing a new one', async () => {
      const { service, resetTokens, users } = buildHarness();
      users.findOne.mockResolvedValue(buildUser());

      await service.request({ email: 'buyer@example.com' });

      expect(resetTokens.update).toHaveBeenCalledWith(
        { userId: 'user-1' },
        { usedAt: expect.any(Date) as Date },
      );
      expect(resetTokens.update.mock.invocationCallOrder[0]).toBeLessThan(
        resetTokens.save.mock.invocationCallOrder[0],
      );
    });

    it('builds the reset link against the configured web app url', async () => {
      const { service, users, mailer } = buildHarness();
      users.findOne.mockResolvedValue(buildUser());

      await service.request({ email: 'buyer@example.com' });

      expect(
        mailer.sent[0].resetUrl.startsWith('https://app.mezzo.test/reset-password?token='),
      ).toBe(true);
      expect(mailer.sent[0].recipientEmail).toBe('buyer@example.com');
    });

    it('stays silent and sends nothing for an unknown email', async () => {
      const { service, users, resetTokens, mailer } = buildHarness();
      users.findOne.mockResolvedValue(null);

      await expect(service.request({ email: 'nobody@example.com' })).resolves.toBeUndefined();

      expect(resetTokens.save).not.toHaveBeenCalled();
      expect(mailer.sent).toHaveLength(0);
    });

    it('looks the user up by their normalized email', async () => {
      const { service, users } = buildHarness();
      users.findOne.mockResolvedValue(buildUser());

      await service.request({ email: 'Buyer@Example.COM' });

      expect(users.findOne).toHaveBeenCalledWith({ where: { email: 'buyer@example.com' } });
    });
  });

  describe('reset', () => {
    it('sets the new password hash, consumes the token, and revokes every refresh token', async () => {
      const { service, resetTokens, refreshTokens, users, passwordService } = buildHarness();
      const record = buildResetToken({ tokenHash: hashOf('raw-token') });
      const user = buildUser();
      resetTokens.findOne.mockResolvedValue(record);
      users.findOne.mockResolvedValue(user);

      await service.reset({ token: 'raw-token', password: 'a-brand-new-password' });

      expect(resetTokens.findOne).toHaveBeenCalledWith({
        where: { tokenHash: hashOf('raw-token') },
      });
      expect(passwordService.hash).toHaveBeenCalledWith('a-brand-new-password');
      expect(users.save).toHaveBeenCalledWith(
        expect.objectContaining({ passwordHash: 'argon2-new-hash' }),
      );
      expect(record.usedAt).toBeInstanceOf(Date);
      expect(refreshTokens.update).toHaveBeenCalledWith(
        { userId: 'user-1' },
        { revokedAt: expect.any(Date) as Date },
      );
    });

    it('rejects an unknown token without touching the user', async () => {
      const { service, resetTokens, users } = buildHarness();
      resetTokens.findOne.mockResolvedValue(null);

      await expect(
        service.reset({ token: 'nope', password: 'a-brand-new-password' }),
      ).rejects.toThrow(InvalidPasswordResetTokenError);
      expect(users.save).not.toHaveBeenCalled();
    });

    it('rejects a token that was already used', async () => {
      const { service, resetTokens, users, refreshTokens } = buildHarness();
      resetTokens.findOne.mockResolvedValue(buildResetToken({ usedAt: new Date() }));
      users.findOne.mockResolvedValue(buildUser());

      await expect(
        service.reset({ token: 'raw-token', password: 'a-brand-new-password' }),
      ).rejects.toThrow(InvalidPasswordResetTokenError);
      expect(users.save).not.toHaveBeenCalled();
      expect(refreshTokens.update).not.toHaveBeenCalled();
    });

    it('rejects a token that has expired', async () => {
      const { service, resetTokens, users } = buildHarness();
      resetTokens.findOne.mockResolvedValue(
        buildResetToken({ expiresAt: new Date(Date.now() - 1000) }),
      );
      users.findOne.mockResolvedValue(buildUser());

      await expect(
        service.reset({ token: 'raw-token', password: 'a-brand-new-password' }),
      ).rejects.toThrow(InvalidPasswordResetTokenError);
      expect(users.save).not.toHaveBeenCalled();
    });

    it('rejects a token whose user no longer exists', async () => {
      const { service, resetTokens, users } = buildHarness();
      resetTokens.findOne.mockResolvedValue(buildResetToken());
      users.findOne.mockResolvedValue(null);

      await expect(
        service.reset({ token: 'raw-token', password: 'a-brand-new-password' }),
      ).rejects.toThrow(InvalidPasswordResetTokenError);
      expect(users.save).not.toHaveBeenCalled();
    });
  });
});

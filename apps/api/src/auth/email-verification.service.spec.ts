import { createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { EmailVerificationService } from './email-verification.service';
import { FakeEmailVerificationMailer } from './mailers/fake-email-verification.mailer';
import { InvalidVerificationCodeError } from './errors/invalid-verification-code.error';
import { EmailVerificationCode } from '../database/entities/email-verification-code.entity';
import { User } from '../database/entities/user.entity';
import { UserRole } from '../users/entities/user-role.enum';
import { KycTier } from '../kyc/entities/kyc-tier.enum';

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'buyer@example.com',
    passwordHash: 'argon2-hash',
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

function buildCode(overrides: Partial<EmailVerificationCode> = {}): EmailVerificationCode {
  return {
    id: 'code-1',
    userId: 'user-1',
    codeHash: 'hash',
    attempts: 0,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    usedAt: null,
    createdAt: new Date(),
    ...overrides,
  } as EmailVerificationCode;
}

const CONFIG: Record<string, unknown> = {
  EMAIL_VERIFICATION_CODE_TTL_MINUTES: 15,
  EMAIL_VERIFICATION_MAX_ATTEMPTS: 5,
};

type SaveCodeMock = jest.Mock<Promise<EmailVerificationCode>, [EmailVerificationCode]>;

interface Harness {
  service: EmailVerificationService;
  codes: { findOne: jest.Mock; create: jest.Mock; save: SaveCodeMock; update: jest.Mock };
  users: { findOne: jest.Mock; save: jest.Mock };
  mailer: FakeEmailVerificationMailer;
}

function buildHarness(): Harness {
  const codes = {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((partial: Partial<EmailVerificationCode>) => partial),
    save: jest.fn((entity: EmailVerificationCode) => Promise.resolve(entity)) as SaveCodeMock,
    update: jest.fn().mockResolvedValue(undefined),
  };
  const users = {
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn((entity: User) => Promise.resolve(entity)),
  };
  const configService = { getOrThrow: jest.fn((key: string) => CONFIG[key]) };
  const mailer = new FakeEmailVerificationMailer();

  const service = new EmailVerificationService(
    codes as unknown as Repository<EmailVerificationCode>,
    users as unknown as Repository<User>,
    configService as unknown as ConfigService,
    mailer,
  );

  return { service, codes, users, mailer };
}

function hashOf(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

describe('EmailVerificationService', () => {
  describe('sendCode', () => {
    it('stores only a hash of the emailed code', async () => {
      const { service, codes, mailer } = buildHarness();
      const user = buildUser();

      await service.sendCode(user);

      expect(mailer.sent).toHaveLength(1);
      const emailedCode = mailer.sent[0].code;
      expect(emailedCode).toMatch(/^\d{6}$/);

      const saved = codes.save.mock.calls[0][0];
      expect(saved.codeHash).toBe(hashOf(emailedCode));
      expect(saved.codeHash).not.toBe(emailedCode);
      expect(mailer.sent[0].recipientEmail).toBe(user.email);
    });

    it('replaces any outstanding code for the user in place, resetting attempts', async () => {
      const { service, codes } = buildHarness();
      codes.findOne.mockResolvedValue(buildCode({ attempts: 3, usedAt: new Date() }));

      await service.sendCode(buildUser());

      const saved = codes.save.mock.calls[0][0];
      expect(saved.id).toBe('code-1');
      expect(saved.attempts).toBe(0);
      expect(saved.usedAt).toBeNull();
    });
  });

  describe('resend', () => {
    it('sends a fresh code for a known, unverified email', async () => {
      const { service, users, mailer } = buildHarness();
      users.findOne.mockResolvedValue(buildUser());

      await service.resend({ email: 'buyer@example.com' });

      expect(mailer.sent).toHaveLength(1);
    });

    it('stays silent for an unknown email, so accounts cannot be enumerated', async () => {
      const { service, users, mailer } = buildHarness();
      users.findOne.mockResolvedValue(null);

      await expect(service.resend({ email: 'nobody@example.com' })).resolves.toBeUndefined();
      expect(mailer.sent).toHaveLength(0);
    });

    it('stays silent for an already-verified email', async () => {
      const { service, users, mailer } = buildHarness();
      users.findOne.mockResolvedValue(buildUser({ emailVerifiedAt: new Date() }));

      await service.resend({ email: 'buyer@example.com' });

      expect(mailer.sent).toHaveLength(0);
    });
  });

  describe('verify', () => {
    it('marks the user verified on a matching code', async () => {
      const { service, users, codes } = buildHarness();
      const user = buildUser();
      users.findOne.mockResolvedValue(user);
      codes.findOne.mockResolvedValue(buildCode({ codeHash: hashOf('123456') }));

      await service.verify({ email: 'buyer@example.com', code: '123456' });

      expect(users.save).toHaveBeenCalledWith(
        expect.objectContaining({ emailVerifiedAt: expect.any(Date) as Date }),
      );
      const savedCode = codes.save.mock.calls[0][0];
      expect(savedCode.usedAt).toBeInstanceOf(Date);
    });

    it('rejects a wrong code and records the attempt', async () => {
      const { service, users, codes } = buildHarness();
      users.findOne.mockResolvedValue(buildUser());
      codes.findOne.mockResolvedValue(buildCode({ codeHash: hashOf('123456'), attempts: 0 }));

      await expect(
        service.verify({ email: 'buyer@example.com', code: '000000' }),
      ).rejects.toBeInstanceOf(InvalidVerificationCodeError);

      const savedCode = codes.save.mock.calls[0][0];
      expect(savedCode.attempts).toBe(1);
      expect(savedCode.usedAt).toBeNull();
      expect(users.save).not.toHaveBeenCalled();
    });

    it('invalidates the code once the max attempt count is reached', async () => {
      const { service, users, codes } = buildHarness();
      users.findOne.mockResolvedValue(buildUser());
      codes.findOne.mockResolvedValue(buildCode({ codeHash: hashOf('123456'), attempts: 4 }));

      await expect(
        service.verify({ email: 'buyer@example.com', code: '000000' }),
      ).rejects.toBeInstanceOf(InvalidVerificationCodeError);

      const savedCode = codes.save.mock.calls[0][0];
      expect(savedCode.attempts).toBe(5);
      expect(savedCode.usedAt).toBeInstanceOf(Date);
    });

    it('rejects an expired code', async () => {
      const { service, users, codes } = buildHarness();
      users.findOne.mockResolvedValue(buildUser());
      codes.findOne.mockResolvedValue(
        buildCode({ codeHash: hashOf('123456'), expiresAt: new Date(Date.now() - 1000) }),
      );

      await expect(
        service.verify({ email: 'buyer@example.com', code: '123456' }),
      ).rejects.toBeInstanceOf(InvalidVerificationCodeError);
      expect(users.save).not.toHaveBeenCalled();
    });

    it('rejects when there is no outstanding code', async () => {
      const { service, users, codes } = buildHarness();
      users.findOne.mockResolvedValue(buildUser());
      codes.findOne.mockResolvedValue(null);

      await expect(
        service.verify({ email: 'buyer@example.com', code: '123456' }),
      ).rejects.toBeInstanceOf(InvalidVerificationCodeError);
    });

    it('rejects verification for an unknown email', async () => {
      const { service, users } = buildHarness();
      users.findOne.mockResolvedValue(null);

      await expect(
        service.verify({ email: 'nobody@example.com', code: '123456' }),
      ).rejects.toBeInstanceOf(InvalidVerificationCodeError);
    });

    it('rejects verification for an already-verified email', async () => {
      const { service, users } = buildHarness();
      users.findOne.mockResolvedValue(buildUser({ emailVerifiedAt: new Date() }));

      await expect(
        service.verify({ email: 'buyer@example.com', code: '123456' }),
      ).rejects.toBeInstanceOf(InvalidVerificationCodeError);
    });
  });
});

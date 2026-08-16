import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { GoogleTokenVerifier, type GoogleIdentity } from './google-token-verifier.service';
import { EmailVerificationService } from './email-verification.service';
import { UsersService } from '../users/users.service';
import { User } from '../database/entities/user.entity';
import { UserRole } from '../users/entities/user-role.enum';
import { UserStatus } from '../users/entities/user-status.enum';
import { KycTier } from '../kyc/entities/kyc-tier.enum';
import { InvalidCredentialsError } from './errors/invalid-credentials.error';
import { GoogleEmailNotVerifiedError } from './errors/google-email-not-verified.error';
import { EmailNotVerifiedError } from './errors/email-not-verified.error';
import { UserSuspendedError } from './errors/user-suspended.error';

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
    emailVerifiedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

interface Harness {
  authService: AuthService;
  usersService: { findByEmail: jest.Mock; linkOrCreateGoogleUser: jest.Mock; create: jest.Mock };
  passwordService: { verify: jest.Mock; hash: jest.Mock };
  googleTokenVerifier: { verify: jest.Mock };
  emailVerificationService: { sendCode: jest.Mock };
}

function buildHarness(): Harness {
  const usersService = {
    findByEmail: jest.fn(),
    linkOrCreateGoogleUser: jest.fn(),
    create: jest.fn(),
  };
  const passwordService = {
    verify: jest.fn().mockResolvedValue(true),
    hash: jest.fn(),
  };
  const tokenService = {
    issueTokenPair: jest.fn().mockResolvedValue({ accessToken: 'access', refreshToken: 'refresh' }),
  };
  const googleTokenVerifier = { verify: jest.fn() };
  const emailVerificationService = { sendCode: jest.fn().mockResolvedValue(undefined) };

  const authService = new AuthService(
    usersService as unknown as UsersService,
    passwordService,
    tokenService as unknown as TokenService,
    googleTokenVerifier as unknown as GoogleTokenVerifier,
    emailVerificationService as unknown as EmailVerificationService,
  );

  return {
    authService,
    usersService,
    passwordService,
    googleTokenVerifier,
    emailVerificationService,
  };
}

function googleIdentity(overrides: Partial<GoogleIdentity> = {}): GoogleIdentity {
  return {
    sub: 'google-user-1',
    email: 'buyer@example.com',
    emailVerified: true,
    ...overrides,
  };
}

describe('AuthService', () => {
  describe('login', () => {
    it('rejects password login for a Google-only account', async () => {
      const { authService, usersService, passwordService } = buildHarness();
      usersService.findByEmail.mockResolvedValue(buildUser({ passwordHash: null }));

      await expect(
        authService.login({ email: 'buyer@example.com', password: 'anything' }),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);
      expect(passwordService.verify).not.toHaveBeenCalled();
    });

    it('rejects an unknown email', async () => {
      const { authService, usersService } = buildHarness();
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        authService.login({ email: 'nobody@example.com', password: 'secret123' }),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);
    });

    it('issues a token pair for a valid password', async () => {
      const { authService, usersService } = buildHarness();
      usersService.findByEmail.mockResolvedValue(buildUser());

      const result = await authService.login({
        email: 'buyer@example.com',
        password: 'secret123',
      });

      expect(result.accessToken).toBe('access');
      expect(result.user.email).toBe('buyer@example.com');
    });

    it('rejects login for an account whose email has not been verified', async () => {
      const { authService, usersService } = buildHarness();
      usersService.findByEmail.mockResolvedValue(buildUser({ emailVerifiedAt: null }));

      await expect(
        authService.login({ email: 'buyer@example.com', password: 'secret123' }),
      ).rejects.toBeInstanceOf(EmailNotVerifiedError);
    });

    it('rejects login for a suspended account even with the correct password', async () => {
      const { authService, usersService } = buildHarness();
      usersService.findByEmail.mockResolvedValue(buildUser({ status: UserStatus.SUSPENDED }));

      await expect(
        authService.login({ email: 'buyer@example.com', password: 'secret123' }),
      ).rejects.toBeInstanceOf(UserSuspendedError);
    });
  });

  describe('register', () => {
    it('sends a verification code to the new user', async () => {
      const { authService, usersService, passwordService, emailVerificationService } =
        buildHarness();
      const created = buildUser({ emailVerifiedAt: null });
      usersService.create.mockResolvedValue(created);
      passwordService.hash.mockResolvedValue('argon2-hash');

      await authService.register({ email: 'buyer@example.com', password: 'secret123' });

      expect(emailVerificationService.sendCode).toHaveBeenCalledWith(created);
    });
  });

  describe('loginWithGoogle', () => {
    it('issues a token pair for a verified Google identity', async () => {
      const { authService, usersService, googleTokenVerifier } = buildHarness();
      googleTokenVerifier.verify.mockResolvedValue(googleIdentity());
      usersService.linkOrCreateGoogleUser.mockResolvedValue(
        buildUser({ googleSub: 'google-user-1' }),
      );

      const result = await authService.loginWithGoogle({ idToken: 'google-id-token' });

      expect(usersService.linkOrCreateGoogleUser).toHaveBeenCalledWith(
        'google-user-1',
        'buyer@example.com',
      );
      expect(result.accessToken).toBe('access');
      expect(result.refreshToken).toBe('refresh');
      expect(result.user.email).toBe('buyer@example.com');
    });

    it('refuses a Google account whose email is unverified', async () => {
      const { authService, usersService, googleTokenVerifier } = buildHarness();
      googleTokenVerifier.verify.mockResolvedValue(googleIdentity({ emailVerified: false }));

      await expect(
        authService.loginWithGoogle({ idToken: 'google-id-token' }),
      ).rejects.toBeInstanceOf(GoogleEmailNotVerifiedError);
      expect(usersService.linkOrCreateGoogleUser).not.toHaveBeenCalled();
    });

    it('never creates a user when the token fails verification', async () => {
      const { authService, usersService, googleTokenVerifier } = buildHarness();
      googleTokenVerifier.verify.mockRejectedValue(new Error('bad token'));

      await expect(authService.loginWithGoogle({ idToken: 'forged' })).rejects.toThrow();
      expect(usersService.linkOrCreateGoogleUser).not.toHaveBeenCalled();
    });

    it('rejects a suspended account signing in with Google', async () => {
      const { authService, usersService, googleTokenVerifier } = buildHarness();
      googleTokenVerifier.verify.mockResolvedValue(googleIdentity());
      usersService.linkOrCreateGoogleUser.mockResolvedValue(
        buildUser({ googleSub: 'google-user-1', status: UserStatus.SUSPENDED }),
      );

      await expect(
        authService.loginWithGoogle({ idToken: 'google-id-token' }),
      ).rejects.toBeInstanceOf(UserSuspendedError);
    });
  });
});

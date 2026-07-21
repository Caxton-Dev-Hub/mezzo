import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { KycTierGuard } from './kyc-tier.guard';
import { KycService } from '../kyc.service';
import { KycTier } from '../entities/kyc-tier.enum';
import { KycTierRequiredError } from '../errors/kyc-tier-required.error';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { UserRole } from '../../users/entities/user-role.enum';

function buildContext(user: AuthenticatedUser | undefined): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('KycTierGuard', () => {
  const user: AuthenticatedUser = { id: 'user-1', role: UserRole.USER };

  it('allows the request through when no minimum tier is required', async () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) } as unknown as Reflector;
    const requireTier = jest.fn();
    const kycService = { requireTier } as unknown as KycService;
    const guard = new KycTierGuard(reflector, kycService);

    await expect(guard.canActivate(buildContext(user))).resolves.toBe(true);
    expect(requireTier).not.toHaveBeenCalled();
  });

  it('rejects when a tier is required but there is no authenticated user', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(KycTier.TIER_1),
    } as unknown as Reflector;
    const kycService = { requireTier: jest.fn() } as unknown as KycService;
    const guard = new KycTierGuard(reflector, kycService);

    await expect(guard.canActivate(buildContext(undefined))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('delegates to KycService.requireTier and allows through when it resolves', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(KycTier.TIER_1),
    } as unknown as Reflector;
    const requireTier = jest.fn().mockResolvedValue(undefined);
    const kycService = { requireTier } as unknown as KycService;
    const guard = new KycTierGuard(reflector, kycService);

    await expect(guard.canActivate(buildContext(user))).resolves.toBe(true);
    expect(requireTier).toHaveBeenCalledWith(user.id, KycTier.TIER_1);
  });

  it('propagates a KycTierRequiredError from the service', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(KycTier.TIER_2),
    } as unknown as Reflector;
    const requireTier = jest.fn().mockRejectedValue(new KycTierRequiredError(KycTier.TIER_2));
    const kycService = { requireTier } as unknown as KycService;
    const guard = new KycTierGuard(reflector, kycService);

    await expect(guard.canActivate(buildContext(user))).rejects.toBeInstanceOf(
      KycTierRequiredError,
    );
  });
});

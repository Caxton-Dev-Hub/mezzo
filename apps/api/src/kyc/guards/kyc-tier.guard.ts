import type { Request } from 'express';
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { KycService } from '../kyc.service';
import { REQUIRE_TIER_KEY } from '../decorators/require-tier.decorator';
import { KycTier } from '../entities/kyc-tier.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';

@Injectable()
export class KycTierGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly kycService: KycService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const minimumTier = this.reflector.getAllAndOverride<KycTier | undefined>(REQUIRE_TIER_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!minimumTier) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();

    if (!request.user) {
      throw new UnauthorizedException('Missing access token');
    }

    await this.kycService.requireTier(request.user.id, minimumTier);
    return true;
  }
}

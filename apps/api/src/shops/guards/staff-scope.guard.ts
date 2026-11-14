import type { Request } from 'express';
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ShopsService } from '../shops.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { UserRole } from '../../users/entities/user-role.enum';

export interface RequestWithShopScope extends Request {
  user?: AuthenticatedUser;
  allowedShopIds: string[] | null;
}

@Injectable()
export class StaffScopeGuard implements CanActivate {
  constructor(private readonly shopsService: ShopsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithShopScope>();

    if (!request.user) {
      throw new ForbiddenException('Authentication required');
    }

    const { role, id: userId } = request.user;

    if (role === UserRole.ADMIN) {
      request.allowedShopIds = null;
      return true;
    }

    if (role === UserRole.STAFF) {
      const shopIds = await this.shopsService.getStaffShopIds(userId);
      request.allowedShopIds = shopIds;
      return true;
    }

    throw new ForbiddenException('Only ADMIN and STAFF users can access this resource');
  }
}

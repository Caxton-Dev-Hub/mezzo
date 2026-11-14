import { UseGuards } from '@nestjs/common';
import { StaffScopeGuard } from '../../shops/guards/staff-scope.guard';
import { RequestWithShopScope } from '../../shops/guards/staff-scope.guard';

export const UseStaffScopeGuard = () => UseGuards(StaffScopeGuard);

export type StaffScopeRequest = RequestWithShopScope;

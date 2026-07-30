import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminDisputePacketResponse } from '@mezzo/shared-types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { UserRole } from '../users/entities/user-role.enum';
import { DisputeState } from '../disputes/entities/dispute-state.enum';
import { KycVerificationStatus } from '../kyc/entities/kyc-verification-status.enum';
import { ReconciliationReport } from '../ledger/reconciliation.service';
import {
  AdminDisputeSummaryResponse,
  AdminKycVerificationResponse,
  AdminUserResponse,
  AuditEventResponse,
  LedgerEntryResponse,
  LedgerPostingResponse,
} from './dto/admin-response';
import {
  overrideKycTierSchema,
  OverrideKycTierDto,
  postAdjustmentSchema,
  PostAdjustmentDto,
} from './dto/admin.schemas';

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('disputes')
  @Roles(UserRole.ARBITER, UserRole.ADMIN)
  async listDisputes(@Query('state') state?: DisputeState): Promise<AdminDisputeSummaryResponse[]> {
    return this.adminService.listDisputes(state);
  }

  @Get('disputes/:id')
  @Roles(UserRole.ARBITER, UserRole.ADMIN)
  async getDisputePacket(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<AdminDisputePacketResponse> {
    return this.adminService.getDisputePacket(id, currentUser);
  }

  @Get('ledger/postings')
  @Roles(UserRole.ADMIN)
  async listPostings(@Query('correlationId') correlationId: string): Promise<LedgerPostingResponse[]> {
    return this.adminService.listPostingsByCorrelationId(correlationId);
  }

  @Get('ledger/entries')
  @Roles(UserRole.ADMIN)
  async listEntries(
    @Query('accountRef') accountRef: string,
    @Query('limit') limit?: string,
  ): Promise<LedgerEntryResponse[]> {
    return this.adminService.listEntriesByAccountRef(accountRef, limit ? Number(limit) : undefined);
  }

  @Get('ledger/reconciliation')
  @Roles(UserRole.ADMIN)
  async getReconciliation(): Promise<ReconciliationReport> {
    return this.adminService.getReconciliationStatus();
  }

  @Post('ledger/adjustments')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN)
  async postAdjustment(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body(new ZodValidationPipe(postAdjustmentSchema)) dto: PostAdjustmentDto,
  ): Promise<LedgerPostingResponse> {
    return this.adminService.postAdjustment(currentUser.id, dto);
  }

  @Get('kyc/queue')
  @Roles(UserRole.ADMIN)
  async listKycQueue(@Query('status') status?: KycVerificationStatus): Promise<AdminKycVerificationResponse[]> {
    return this.adminService.listKycQueue(status);
  }

  @Post('kyc/users/:userId/tier')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  async overrideKycTier(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(overrideKycTierSchema)) dto: OverrideKycTierDto,
  ): Promise<{ before: string; after: string }> {
    return this.adminService.overrideKycTier(currentUser.id, userId, dto);
  }

  @Get('users')
  @Roles(UserRole.ADMIN)
  async listUsers(): Promise<AdminUserResponse[]> {
    return this.adminService.listUsers();
  }

  @Get('audit')
  @Roles(UserRole.ADMIN)
  async listAuditEvents(
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
  ): Promise<AuditEventResponse[]> {
    return this.adminService.listAuditEvents(entityType, entityId);
  }
}

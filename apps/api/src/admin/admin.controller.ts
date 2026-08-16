import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { AdminService } from './admin.service';
import {
  AdminDisputePacketResponse,
  AdminUserDetailResponse,
  adminUserListQuerySchema,
  AdminUserListQuery,
  AdminUserListResponse,
  adminWaitlistListQuerySchema,
  AdminWaitlistListQuery,
  AdminWaitlistListResponse,
  adminActionReasonSchema,
  AdminActionReasonDto,
  HideChatMessageResponse,
  PlatformSettingsResponse,
  updateUserRoleSchema,
  UpdateUserRoleDto,
  UpdateUserRoleResult,
  updateUserStatusSchema,
  UpdateUserStatusDto,
  UpdateUserStatusResult,
  updateVerificationEnabledSchema,
  UpdateVerificationEnabledDto,
} from '@mezzo/shared-types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { UserRole } from '../users/entities/user-role.enum';
import { DisputeState } from '../disputes/entities/dispute-state.enum';
import { EscrowState } from '../escrow/entities/escrow-state.enum';
import { KycVerificationStatus } from '../kyc/entities/kyc-verification-status.enum';
import { PayoutStatus } from '../payments/entities/payout-status.enum';
import { PaymentIntentStatus } from '../payments/entities/payment-intent-status.enum';
import { ReconciliationReport } from '../ledger/reconciliation.service';
import {
  AdminDisputeSummaryResponse,
  AdminEscrowResponse,
  AdminKycVerificationResponse,
  AdminPaymentIntentResponse,
  AdminPayoutResponse,
  AdminRiskItemResponse,
  AuditEventResponse,
  LedgerEntryResponse,
  LedgerPostingResponse,
} from './dto/admin-response';
import {
  overrideKycTierSchema,
  OverrideKycTierDto,
  postAdjustmentSchema,
  PostAdjustmentDto,
  updateWhatsappTransactionalEnabledSchema,
  UpdateWhatsappTransactionalEnabledDto,
} from './dto/admin.schemas';
import { WhatsappTransactionalSettingsResponse } from './dto/admin-response';

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
  async listUsers(
    @Query(new ZodValidationPipe(adminUserListQuerySchema)) query: AdminUserListQuery,
  ): Promise<AdminUserListResponse> {
    return this.adminService.listUsers(query);
  }

  @Get('users/:id')
  @Roles(UserRole.ADMIN)
  async getUserDetail(@Param('id') id: string): Promise<AdminUserDetailResponse> {
    return this.adminService.getUserDetail(id);
  }

  @Patch('users/:id/role')
  @Roles(UserRole.ADMIN)
  async updateUserRole(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateUserRoleSchema)) dto: UpdateUserRoleDto,
  ): Promise<UpdateUserRoleResult> {
    return this.adminService.updateUserRole(currentUser.id, id, dto);
  }

  @Patch('users/:id/status')
  @Roles(UserRole.ADMIN)
  async updateUserStatus(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateUserStatusSchema)) dto: UpdateUserStatusDto,
  ): Promise<UpdateUserStatusResult> {
    return this.adminService.updateUserStatus(currentUser.id, id, dto);
  }

  @Get('waitlist')
  @Roles(UserRole.ADMIN)
  async listWaitlist(
    @Query(new ZodValidationPipe(adminWaitlistListQuerySchema)) query: AdminWaitlistListQuery,
  ): Promise<AdminWaitlistListResponse> {
    return this.adminService.listWaitlist(query);
  }

  @Get('audit')
  @Roles(UserRole.ADMIN)
  async listAuditEvents(
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
  ): Promise<AuditEventResponse[]> {
    return this.adminService.listAuditEvents(entityType, entityId);
  }

  @Get('escrows')
  @Roles(UserRole.ADMIN)
  async listEscrows(@Query('state') state?: EscrowState): Promise<AdminEscrowResponse[]> {
    return this.adminService.listEscrows(state);
  }

  @Get('escrows/at-risk')
  @Roles(UserRole.ADMIN)
  async listAtRisk(): Promise<AdminRiskItemResponse[]> {
    return this.adminService.listAtRisk();
  }

  @Post('escrows/:id/force-release')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  async forceReleaseEscrow(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(adminActionReasonSchema)) dto: AdminActionReasonDto,
  ): Promise<AdminEscrowResponse> {
    return this.adminService.forceReleaseEscrow(currentUser.id, id, dto.reason);
  }

  @Post('escrows/:id/force-refund')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  async forceRefundEscrow(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(adminActionReasonSchema)) dto: AdminActionReasonDto,
  ): Promise<AdminEscrowResponse> {
    return this.adminService.forceRefundEscrow(currentUser.id, id, dto.reason);
  }

  @Get('payouts')
  @Roles(UserRole.ADMIN)
  async listPayouts(@Query('status') status?: PayoutStatus): Promise<AdminPayoutResponse[]> {
    return this.adminService.listPayouts(status);
  }

  @Post('payouts/:id/retry')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  async retryPayout(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(adminActionReasonSchema)) dto: AdminActionReasonDto,
  ): Promise<AdminPayoutResponse> {
    return this.adminService.retryPayout(currentUser.id, id, dto.reason);
  }

  @Get('payment-intents')
  @Roles(UserRole.ADMIN)
  async listPaymentIntents(
    @Query('status') status?: PaymentIntentStatus,
  ): Promise<AdminPaymentIntentResponse[]> {
    return this.adminService.listPaymentIntents(status);
  }

  @Post('payment-intents/:id/resolve-quarantine')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  async resolvePaymentIntentQuarantine(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(adminActionReasonSchema)) dto: AdminActionReasonDto,
  ): Promise<AdminPaymentIntentResponse> {
    return this.adminService.resolvePaymentIntentQuarantine(currentUser.id, id, dto.reason);
  }

  @Post('chat/messages/:id/hide')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  async hideChatMessage(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(adminActionReasonSchema)) dto: AdminActionReasonDto,
  ): Promise<HideChatMessageResponse> {
    return this.adminService.hideChatMessage(currentUser.id, id, dto.reason);
  }

  @Get('settings')
  @Roles(UserRole.ADMIN)
  async getSettings(): Promise<PlatformSettingsResponse> {
    return this.adminService.getPlatformSettings();
  }

  @Post('settings/verification')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  async setVerificationEnabled(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateVerificationEnabledSchema)) dto: UpdateVerificationEnabledDto,
  ): Promise<PlatformSettingsResponse> {
    return this.adminService.setVerificationEnabled(currentUser.id, dto);
  }

  @Get('settings/whatsapp-transactional')
  @Roles(UserRole.ADMIN)
  async getWhatsappTransactionalSetting(): Promise<WhatsappTransactionalSettingsResponse> {
    return this.adminService.getWhatsappTransactionalSetting();
  }

  @Post('settings/whatsapp-transactional')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  async setWhatsappTransactionalEnabled(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateWhatsappTransactionalEnabledSchema))
    dto: UpdateWhatsappTransactionalEnabledDto,
  ): Promise<WhatsappTransactionalSettingsResponse> {
    return this.adminService.setWhatsappTransactionalEnabled(currentUser.id, dto);
  }
}

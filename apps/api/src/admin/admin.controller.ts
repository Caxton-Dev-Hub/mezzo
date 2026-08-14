import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { AdminService } from './admin.service';
import {
  AdminDisputePacketResponse,
  PlatformSettingsResponse,
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

  @Get('payouts')
  @Roles(UserRole.ADMIN)
  async listPayouts(@Query('status') status?: PayoutStatus): Promise<AdminPayoutResponse[]> {
    return this.adminService.listPayouts(status);
  }

  @Get('payment-intents')
  @Roles(UserRole.ADMIN)
  async listPaymentIntents(
    @Query('status') status?: PaymentIntentStatus,
  ): Promise<AdminPaymentIntentResponse[]> {
    return this.adminService.listPaymentIntents(status);
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

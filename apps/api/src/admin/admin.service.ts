import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AdminDisputePacketResponse,
  AdminUserDetailResponse,
  AdminUserListQuery,
  AdminUserListResponse,
  AdminWaitlistListQuery,
  AdminWaitlistListResponse,
  PlatformSettingsResponse,
  UpdateUserRoleDto,
  UpdateUserRoleResult,
  UpdateUserStatusDto,
  UpdateUserStatusResult,
  UpdateVerificationEnabledDto,
} from '@mezzo/shared-types';
import { EscrowService } from '../escrow/escrow.service';
import { SettlementService } from '../escrow/settlement.service';
import { EscrowState } from '../escrow/entities/escrow-state.enum';
import { PayoutService } from '../payments/payout.service';
import { PaymentsService } from '../payments/payments.service';
import { ProviderFloatReport, ProviderFloatService } from '../payments/provider-float.service';
import { PayoutStatus } from '../payments/entities/payout-status.enum';
import { PaymentIntentStatus } from '../payments/entities/payment-intent-status.enum';
import { SettingsService } from '../settings/settings.service';
import { VERIFICATION_FLAG_KEY, WHATSAPP_TRANSACTIONAL_FLAG_KEY } from '../settings/platform-flag-key';
import { computeRiskItems } from './escrow-risk';
import { DisputeService } from '../disputes/dispute.service';
import { DisputeState } from '../disputes/entities/dispute-state.enum';
import { ArbitrationService } from '../arbitration/arbitration.service';
import { LedgerService, PostingLine } from '../ledger/ledger.service';
import { ReconciliationService, ReconciliationReport } from '../ledger/reconciliation.service';
import { EntryDirection } from '../ledger/entities/entry-direction.enum';
import { Money } from '../common/money/money';
import { KycService } from '../kyc/kyc.service';
import { KycTier } from '../kyc/entities/kyc-tier.enum';
import { KycVerificationStatus } from '../kyc/entities/kyc-verification-status.enum';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/entities/user-role.enum';
import { UserStatus } from '../users/entities/user-status.enum';
import { WaitlistService } from '../waitlist/waitlist.service';
import { ChatService } from '../chat/chat.service';
import { TokenService } from '../auth/token.service';
import { AuditService } from '../audit/audit.service';
import { RequestContextService } from '../common/context/request-context';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { toArbitrationRecordResponse } from '../arbitration/dto/arbitration-response';
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
  toAdminDisputeSummaryResponse,
  toAdminEscrowResponse,
  toAdminKycVerificationResponse,
  toAdminPaymentIntentResponse,
  toAdminPayoutResponse,
  toAdminUserDetailResponse,
  toAdminUserListItemResponse,
  toAuditEventResponse,
  toLedgerEntryResponse,
  toLedgerPostingResponse,
  WhatsappTransactionalSettingsResponse,
} from './dto/admin-response';
import {
  OverrideKycTierDto,
  PostAdjustmentDto,
  UpdateWhatsappTransactionalEnabledDto,
} from './dto/admin.schemas';
import { ReviewKycVerificationDto } from '@mezzo/shared-types';

export type { AdminDisputePacketResponse };

@Injectable()
export class AdminService {
  constructor(
    private readonly disputeService: DisputeService,
    private readonly arbitrationService: ArbitrationService,
    private readonly ledgerService: LedgerService,
    private readonly reconciliationService: ReconciliationService,
    private readonly kycService: KycService,
    private readonly usersService: UsersService,
    private readonly auditService: AuditService,
    private readonly requestContext: RequestContextService,
    private readonly escrowService: EscrowService,
    private readonly settlementService: SettlementService,
    private readonly payoutService: PayoutService,
    private readonly paymentsService: PaymentsService,
    private readonly providerFloatService: ProviderFloatService,
    private readonly settingsService: SettingsService,
    private readonly configService: ConfigService,
    private readonly waitlistService: WaitlistService,
    private readonly chatService: ChatService,
    private readonly tokenService: TokenService,
  ) {}

  async listDisputes(state?: DisputeState): Promise<AdminDisputeSummaryResponse[]> {
    const disputes = await this.disputeService.listByState(state);
    return Promise.all(
      disputes.map(async (dispute) => {
        const records = await this.arbitrationService.listForDispute(dispute.id);
        return toAdminDisputeSummaryResponse(dispute, records[0] ?? null);
      }),
    );
  }

  async getDisputePacket(disputeId: string, currentUser: AuthenticatedUser): Promise<AdminDisputePacketResponse> {
    const [packet, records] = await Promise.all([
      this.disputeService.getPacket(disputeId, currentUser),
      this.arbitrationService.listForDispute(disputeId),
    ]);
    return { packet, arbitrationRecords: records.map(toArbitrationRecordResponse) };
  }

  async listPostingsByCorrelationId(correlationId: string): Promise<LedgerPostingResponse[]> {
    const postings = await this.ledgerService.listPostingsByCorrelationId(correlationId);
    return Promise.all(
      postings.map(async (posting) => {
        const entries = await this.ledgerService.listEntriesForPosting(posting.id);
        return toLedgerPostingResponse(posting, entries);
      }),
    );
  }

  async listEntriesByAccountRef(ref: string, limit?: number): Promise<LedgerEntryResponse[]> {
    const entries = await this.ledgerService.listEntriesByAccountRef(ref, limit);
    return entries.map(toLedgerEntryResponse);
  }

  async getReconciliationStatus(): Promise<ReconciliationReport> {
    return this.reconciliationService.reconcile();
  }

  async getProviderFloat(): Promise<ProviderFloatReport[]> {
    return this.providerFloatService.report();
  }

  async postAdjustment(actorId: string, dto: PostAdjustmentDto): Promise<LedgerPostingResponse> {
    const money = Money.of(dto.amount, dto.currency);
    const lines: PostingLine[] = [
      { accountRef: dto.debitAccountRef, direction: EntryDirection.DEBIT, money },
      { accountRef: dto.creditAccountRef, direction: EntryDirection.CREDIT, money },
    ];

    const correlationId = this.requestContext.correlationId();
    const idempotencyKey = `admin-adjustment:${actorId}:${dto.debitAccountRef}:${dto.creditAccountRef}:${dto.amount}:${dto.currency}:${Date.now()}`;

    const posting = await this.ledgerService.postTransaction(lines, { idempotencyKey, correlationId });
    const entries = await this.ledgerService.listEntriesForPosting(posting.id);

    await this.auditService.record({
      actorId,
      action: 'LEDGER_ADJUSTMENT_POSTED',
      entityType: 'ledger_posting',
      entityId: posting.id,
      reason: dto.reason,
      after: {
        debitAccountRef: dto.debitAccountRef,
        creditAccountRef: dto.creditAccountRef,
        amount: dto.amount,
        currency: dto.currency,
      },
      correlationId,
    });

    return toLedgerPostingResponse(posting, entries);
  }

  async listKycQueue(status?: KycVerificationStatus): Promise<AdminKycVerificationResponse[]> {
    const verifications = await this.kycService.listVerifications(status);
    return Promise.all(
      verifications.map(async (verification) => {
        const documents = await this.kycService.listDocuments(verification.id);
        return toAdminKycVerificationResponse(verification, documents);
      }),
    );
  }

  async approveKycVerification(
    actorId: string,
    verificationId: string,
    dto: ReviewKycVerificationDto,
  ): Promise<AdminKycVerificationResponse> {
    const correlationId = this.requestContext.correlationId();
    const verification = await this.kycService.approveVerification(verificationId);

    await this.auditService.record({
      actorId,
      action: 'KYC_VERIFICATION_APPROVED',
      entityType: 'kyc_verification',
      entityId: verification.id,
      reason: dto.reason,
      before: { status: 'PENDING' },
      after: { status: verification.status },
      correlationId,
    });

    const documents = await this.kycService.listDocuments(verification.id);
    return toAdminKycVerificationResponse(verification, documents);
  }

  async rejectKycVerification(
    actorId: string,
    verificationId: string,
    dto: ReviewKycVerificationDto,
  ): Promise<AdminKycVerificationResponse> {
    const correlationId = this.requestContext.correlationId();
    const verification = await this.kycService.rejectVerification(verificationId);

    await this.auditService.record({
      actorId,
      action: 'KYC_VERIFICATION_REJECTED',
      entityType: 'kyc_verification',
      entityId: verification.id,
      reason: dto.reason,
      before: { status: 'PENDING' },
      after: { status: verification.status },
      correlationId,
    });

    const documents = await this.kycService.listDocuments(verification.id);
    return toAdminKycVerificationResponse(verification, documents);
  }

  async overrideKycTier(actorId: string, userId: string, dto: OverrideKycTierDto): Promise<{ before: string; after: string }> {
    const correlationId = this.requestContext.correlationId();
    const { before, after } = await this.kycService.overrideTier(userId, dto.tier);

    await this.auditService.record({
      actorId,
      action: 'KYC_TIER_OVERRIDE',
      entityType: 'user',
      entityId: userId,
      reason: dto.reason,
      before: { tier: before },
      after: { tier: after },
      correlationId,
    });

    return { before, after };
  }

  async listUsers(query: AdminUserListQuery): Promise<AdminUserListResponse> {
    const { items, total } = await this.usersService.search({
      q: query.q,
      role: query.role as UserRole | undefined,
      status: query.status as UserStatus | undefined,
      kycTier: query.kycTier as KycTier | undefined,
      page: query.page,
      pageSize: query.pageSize,
    });

    return {
      items: items.map(toAdminUserListItemResponse),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async getUserDetail(userId: string): Promise<AdminUserDetailResponse> {
    const user = await this.usersService.getById(userId);

    const [escrowResult, disputes, paymentIntents, payouts] = await Promise.all([
      this.escrowService.listForUser(userId, {
        page: 1,
        pageSize: 50,
        sortBy: 'updatedAt',
        sortDir: 'desc',
      }),
      this.disputeService.listForEscrowIds(await this.escrowService.listEscrowIdsForUser(userId)),
      this.paymentsService.listIntentsForUser(userId),
      this.payoutService.listPayouts(userId),
    ]);

    const escrows = escrowResult.items.flatMap(({ escrow, terms, parties }) => {
      const party = parties.find((p) => p.userId === userId);
      return party ? [{ escrow, terms, role: party.role }] : [];
    });

    return toAdminUserDetailResponse({
      user,
      escrows,
      disputes,
      paymentIntents,
      payouts,
    });
  }

  async updateUserRole(
    actorId: string,
    userId: string,
    dto: UpdateUserRoleDto,
  ): Promise<UpdateUserRoleResult> {
    const correlationId = this.requestContext.correlationId();
    const { before, after } = await this.usersService.updateRole(userId, dto.role as UserRole);

    await this.auditService.record({
      actorId,
      action: 'USER_ROLE_CHANGED',
      entityType: 'user',
      entityId: userId,
      reason: dto.reason,
      before: { role: before },
      after: { role: after },
      correlationId,
    });

    return { before, after };
  }

  async updateUserStatus(
    actorId: string,
    userId: string,
    dto: UpdateUserStatusDto,
  ): Promise<UpdateUserStatusResult> {
    const correlationId = this.requestContext.correlationId();
    const { before, after } = await this.usersService.updateStatus(userId, dto.status as UserStatus);

    if (after === UserStatus.SUSPENDED) {
      await this.tokenService.revokeAllForUser(userId);
    }

    await this.auditService.record({
      actorId,
      action: 'USER_STATUS_CHANGED',
      entityType: 'user',
      entityId: userId,
      reason: dto.reason,
      before: { status: before },
      after: { status: after },
      correlationId,
    });

    return { before, after };
  }

  async listWaitlist(query: AdminWaitlistListQuery): Promise<AdminWaitlistListResponse> {
    const { items, total } = await this.waitlistService.findAll({
      page: query.page,
      pageSize: query.pageSize,
    });

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async listAuditEvents(entityType?: string, entityId?: string): Promise<AuditEventResponse[]> {
    const events = await this.auditService.list({ entityType, entityId });
    return events.map(toAuditEventResponse);
  }

  async listEscrows(state?: EscrowState): Promise<AdminEscrowResponse[]> {
    const rows = await this.escrowService.listAll(state);
    const emails = await this.usersService.findEmailsByIds(
      rows.flatMap(({ parties }) => parties.map((party) => party.userId)),
    );

    return rows.map(({ escrow, terms, parties }) =>
      toAdminEscrowResponse(escrow, terms, parties, emails),
    );
  }

  async listPayouts(status?: PayoutStatus): Promise<AdminPayoutResponse[]> {
    const payouts = await this.payoutService.listAllPayouts(status);
    const emails = await this.usersService.findEmailsByIds(
      payouts.map((payout) => payout.sellerId),
    );

    return payouts.map((payout) => toAdminPayoutResponse(payout, emails));
  }

  async listPaymentIntents(status?: PaymentIntentStatus): Promise<AdminPaymentIntentResponse[]> {
    const intents = await this.paymentsService.listAllIntents(status);
    const emails = await this.usersService.findEmailsByIds(
      intents.map((intent) => intent.buyerId),
    );

    return intents.map((intent) => toAdminPaymentIntentResponse(intent, emails));
  }

  async listAtRisk(): Promise<AdminRiskItemResponse[]> {
    const [escrows, payouts, intents] = await Promise.all([
      this.escrowService.listAll(),
      this.payoutService.listAllPayouts(),
      this.paymentsService.listAllIntents(),
    ]);

    return computeRiskItems(
      { escrows, payouts, intents, now: new Date() },
      {
        unshippedHours: this.configService.getOrThrow<number>('ADMIN_RISK_UNSHIPPED_HOURS'),
        inviteExpiryHours: this.configService.getOrThrow<number>('ESCROW_INVITE_EXPIRY_HOURS'),
        disputeWindowHours: this.configService.getOrThrow<number>('DISPUTE_EVIDENCE_WINDOW_HOURS'),
        stalePayoutHours: this.configService.getOrThrow<number>('ADMIN_RISK_STALE_PAYOUT_HOURS'),
        staleIntentHours: this.configService.getOrThrow<number>('ADMIN_RISK_STALE_INTENT_HOURS'),
        unsettledHours: this.configService.getOrThrow<number>('ADMIN_RISK_UNSETTLED_HOURS'),
      },
    );
  }

  async resolvePaymentIntentQuarantine(
    actorId: string,
    intentId: string,
    reason: string,
  ): Promise<AdminPaymentIntentResponse> {
    const correlationId = this.requestContext.correlationId();
    const intent = await this.paymentsService.resolveQuarantinedIntent(intentId);

    await this.auditService.record({
      actorId,
      action: 'PAYMENT_INTENT_QUARANTINE_RESOLVED',
      entityType: 'payment_intent',
      entityId: intentId,
      reason,
      after: { status: intent.status },
      correlationId,
    });

    const emails = await this.usersService.findEmailsByIds([intent.buyerId]);
    return toAdminPaymentIntentResponse(intent, emails);
  }

  async retryPayout(actorId: string, payoutId: string, reason: string): Promise<AdminPayoutResponse> {
    const correlationId = this.requestContext.correlationId();
    const retried = await this.payoutService.retryPayout(payoutId);

    await this.auditService.record({
      actorId,
      action: 'PAYOUT_RETRIED',
      entityType: 'payout',
      entityId: payoutId,
      reason,
      after: { newPayoutId: retried.id, status: retried.status },
      correlationId,
    });

    const emails = await this.usersService.findEmailsByIds([retried.sellerId]);
    return toAdminPayoutResponse(retried, emails);
  }

  async forceReleaseEscrow(actorId: string, escrowId: string, reason: string): Promise<AdminEscrowResponse> {
    const correlationId = this.requestContext.correlationId();
    await this.settlementService.adminRelease(escrowId, actorId);

    await this.auditService.record({
      actorId,
      action: 'ESCROW_FORCE_RELEASED',
      entityType: 'escrow',
      entityId: escrowId,
      reason,
      correlationId,
    });

    return this.getEscrowById(escrowId);
  }

  async forceRefundEscrow(actorId: string, escrowId: string, reason: string): Promise<AdminEscrowResponse> {
    const correlationId = this.requestContext.correlationId();
    await this.settlementService.refund(escrowId, actorId);

    await this.auditService.record({
      actorId,
      action: 'ESCROW_FORCE_REFUNDED',
      entityType: 'escrow',
      entityId: escrowId,
      reason,
      correlationId,
    });

    return this.getEscrowById(escrowId);
  }

  private async getEscrowById(escrowId: string): Promise<AdminEscrowResponse> {
    const { escrow, terms, parties } = await this.escrowService.getDetail(escrowId);
    const emails = await this.usersService.findEmailsByIds(parties.map((party) => party.userId));
    return toAdminEscrowResponse(escrow, terms, parties, emails);
  }

  async hideChatMessage(
    actorId: string,
    messageId: string,
    reason: string,
  ): Promise<{ id: string; hiddenAt: Date; hiddenBy: string }> {
    const correlationId = this.requestContext.correlationId();
    const message = await this.chatService.hideMessage(messageId, actorId);

    await this.auditService.record({
      actorId,
      action: 'CHAT_MESSAGE_HIDDEN',
      entityType: 'chat_message',
      entityId: messageId,
      reason,
      correlationId,
    });

    if (!message.hiddenAt) {
      throw new Error('Chat message hide did not persist hiddenAt');
    }

    return { id: message.id, hiddenAt: message.hiddenAt, hiddenBy: actorId };
  }

  async getPlatformSettings(): Promise<PlatformSettingsResponse> {
    return this.settingsService.getPlatformSettings();
  }

  async getWhatsappTransactionalSetting(): Promise<WhatsappTransactionalSettingsResponse> {
    const enabled = await this.settingsService.isWhatsappTransactionalEnabled();
    return { whatsappTransactionalEnabled: enabled };
  }

  async setVerificationEnabled(
    actorId: string,
    dto: UpdateVerificationEnabledDto,
  ): Promise<PlatformSettingsResponse> {
    const correlationId = this.requestContext.correlationId();
    const { before, after } = await this.settingsService.setVerificationEnabled(
      actorId,
      dto.enabled,
    );

    await this.auditService.record({
      actorId,
      action: 'VERIFICATION_AVAILABILITY_CHANGED',
      entityType: 'platform_flag',
      entityId: VERIFICATION_FLAG_KEY,
      reason: dto.reason,
      before: { verificationEnabled: before },
      after: { verificationEnabled: after },
      correlationId,
    });

    return this.settingsService.getPlatformSettings();
  }

  async setWhatsappTransactionalEnabled(
    actorId: string,
    dto: UpdateWhatsappTransactionalEnabledDto,
  ): Promise<WhatsappTransactionalSettingsResponse> {
    const correlationId = this.requestContext.correlationId();
    const { before, after } = await this.settingsService.setWhatsappTransactionalEnabled(
      actorId,
      dto.enabled,
    );

    await this.auditService.record({
      actorId,
      action: 'WHATSAPP_TRANSACTIONAL_AVAILABILITY_CHANGED',
      entityType: 'platform_flag',
      entityId: WHATSAPP_TRANSACTIONAL_FLAG_KEY,
      reason: dto.reason,
      before: { whatsappTransactionalEnabled: before },
      after: { whatsappTransactionalEnabled: after },
      correlationId,
    });

    return { whatsappTransactionalEnabled: after };
  }
}

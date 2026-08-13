import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AdminDisputePacketResponse,
  PlatformSettingsResponse,
  UpdateVerificationEnabledDto,
} from '@mezzo/shared-types';
import { EscrowService } from '../escrow/escrow.service';
import { EscrowState } from '../escrow/entities/escrow-state.enum';
import { PayoutService } from '../payments/payout.service';
import { PaymentsService } from '../payments/payments.service';
import { PayoutStatus } from '../payments/entities/payout-status.enum';
import { PaymentIntentStatus } from '../payments/entities/payment-intent-status.enum';
import { SettingsService } from '../settings/settings.service';
import { VERIFICATION_FLAG_KEY } from '../settings/platform-flag-key';
import { computeRiskItems } from './escrow-risk';
import { DisputeService } from '../disputes/dispute.service';
import { DisputeState } from '../disputes/entities/dispute-state.enum';
import { ArbitrationService } from '../arbitration/arbitration.service';
import { LedgerService, PostingLine } from '../ledger/ledger.service';
import { ReconciliationService, ReconciliationReport } from '../ledger/reconciliation.service';
import { EntryDirection } from '../ledger/entities/entry-direction.enum';
import { Money } from '../common/money/money';
import { KycService } from '../kyc/kyc.service';
import { KycVerificationStatus } from '../kyc/entities/kyc-verification-status.enum';
import { UsersService } from '../users/users.service';
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
  AdminUserResponse,
  AuditEventResponse,
  LedgerEntryResponse,
  LedgerPostingResponse,
  toAdminDisputeSummaryResponse,
  toAdminEscrowResponse,
  toAdminKycVerificationResponse,
  toAdminPaymentIntentResponse,
  toAdminPayoutResponse,
  toAdminUserResponse,
  toAuditEventResponse,
  toLedgerEntryResponse,
  toLedgerPostingResponse,
} from './dto/admin-response';
import { OverrideKycTierDto, PostAdjustmentDto } from './dto/admin.schemas';

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
    private readonly payoutService: PayoutService,
    private readonly paymentsService: PaymentsService,
    private readonly settingsService: SettingsService,
    private readonly configService: ConfigService,
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
    return verifications.map(toAdminKycVerificationResponse);
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

  async listUsers(): Promise<AdminUserResponse[]> {
    const users = await this.usersService.findAll();
    return users.map(toAdminUserResponse);
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

  async getPlatformSettings(): Promise<PlatformSettingsResponse> {
    return this.settingsService.getPlatformSettings();
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
}

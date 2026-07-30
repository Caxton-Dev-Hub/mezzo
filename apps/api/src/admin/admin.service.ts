import { Injectable } from '@nestjs/common';
import { AdminDisputePacketResponse } from '@mezzo/shared-types';
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
  AdminKycVerificationResponse,
  AdminUserResponse,
  AuditEventResponse,
  LedgerEntryResponse,
  LedgerPostingResponse,
  toAdminDisputeSummaryResponse,
  toAdminKycVerificationResponse,
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
}

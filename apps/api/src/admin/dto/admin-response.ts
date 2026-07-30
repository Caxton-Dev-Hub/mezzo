import { AdminDisputeSummaryResponse, AuditEventResponse } from '@mezzo/shared-types';
import { User } from '../../database/entities/user.entity';
import { Dispute } from '../../database/entities/dispute.entity';
import { KycVerification } from '../../database/entities/kyc-verification.entity';
import { LedgerPosting } from '../../database/entities/ledger-posting.entity';
import { LedgerEntry } from '../../database/entities/ledger-entry.entity';
import { AuditEvent } from '../../database/entities/audit-event.entity';
import { ArbitrationRecord } from '../../database/entities/arbitration-record.entity';
import { toDisputeResponse } from '../../disputes/dto/dispute-response';
import { toArbitrationRecordResponse } from '../../arbitration/dto/arbitration-response';
import { UserRole } from '../../users/entities/user-role.enum';
import { KycTier } from '../../kyc/entities/kyc-tier.enum';
import { KycVerificationStatus } from '../../kyc/entities/kyc-verification-status.enum';
import { Currency } from '../../common/money/currency';
import { EntryDirection } from '../../ledger/entities/entry-direction.enum';

export interface AdminUserResponse {
  id: string;
  email: string;
  role: UserRole;
  kycTier: KycTier;
  createdAt: Date;
}

export function toAdminUserResponse(user: User): AdminUserResponse {
  return { id: user.id, email: user.email, role: user.role, kycTier: user.kycTier, createdAt: user.createdAt };
}

export type { AdminDisputeSummaryResponse, AuditEventResponse };

export function toAdminDisputeSummaryResponse(
  dispute: Dispute,
  latestRecord: ArbitrationRecord | null,
): AdminDisputeSummaryResponse {
  return {
    dispute: toDisputeResponse(dispute),
    latestArbitrationRecord: latestRecord ? toArbitrationRecordResponse(latestRecord) : null,
  };
}

export interface AdminKycVerificationResponse {
  id: string;
  userId: string;
  status: KycVerificationStatus;
  requestedTier: KycTier;
  provider: string;
  providerReference: string;
  createdAt: Date;
}

export function toAdminKycVerificationResponse(verification: KycVerification): AdminKycVerificationResponse {
  return {
    id: verification.id,
    userId: verification.userId,
    status: verification.status,
    requestedTier: verification.requestedTier,
    provider: verification.provider,
    providerReference: verification.providerReference,
    createdAt: verification.createdAt,
  };
}

export interface LedgerEntryResponse {
  id: string;
  accountId: string;
  direction: EntryDirection;
  amount: number;
  currency: Currency;
  createdAt: Date;
}

export function toLedgerEntryResponse(entry: LedgerEntry): LedgerEntryResponse {
  return {
    id: entry.id,
    accountId: entry.accountId,
    direction: entry.direction,
    amount: entry.amount,
    currency: entry.currency,
    createdAt: entry.createdAt,
  };
}

export interface LedgerPostingResponse {
  id: string;
  idempotencyKey: string;
  correlationId: string | null;
  createdAt: Date;
  entries: LedgerEntryResponse[];
}

export function toLedgerPostingResponse(posting: LedgerPosting, entries: LedgerEntry[]): LedgerPostingResponse {
  return {
    id: posting.id,
    idempotencyKey: posting.idempotencyKey,
    correlationId: posting.correlationId,
    createdAt: posting.createdAt,
    entries: entries.map(toLedgerEntryResponse),
  };
}

export function toAuditEventResponse(event: AuditEvent): AuditEventResponse {
  return {
    id: event.id,
    actorId: event.actorId,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    reason: event.reason,
    beforeState: event.beforeState,
    afterState: event.afterState,
    correlationId: event.correlationId,
    createdAt: event.createdAt,
  };
}

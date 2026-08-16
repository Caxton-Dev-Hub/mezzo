import {
  AdminDisputeSummaryResponse,
  AdminEscrowResponse,
  AdminPaymentIntentResponse,
  AdminPayoutResponse,
  AdminRiskItemResponse,
  AdminUserDetailResponse,
  AdminUserListItemResponse,
  AuditEventResponse,
} from '@mezzo/shared-types';
import { PayoutResponse } from '@mezzo/shared-types';
import { User } from '../../database/entities/user.entity';
import { Dispute } from '../../database/entities/dispute.entity';
import { Escrow } from '../../database/entities/escrow.entity';
import { EscrowTerms } from '../../database/entities/escrow-terms.entity';
import { EscrowParty } from '../../database/entities/escrow-party.entity';
import { Payout } from '../../database/entities/payout.entity';
import { PaymentIntent } from '../../database/entities/payment-intent.entity';
import { KycVerification } from '../../database/entities/kyc-verification.entity';
import { LedgerPosting } from '../../database/entities/ledger-posting.entity';
import { LedgerEntry } from '../../database/entities/ledger-entry.entity';
import { AuditEvent } from '../../database/entities/audit-event.entity';
import { ArbitrationRecord } from '../../database/entities/arbitration-record.entity';
import { toDisputeResponse } from '../../disputes/dto/dispute-response';
import { toArbitrationRecordResponse } from '../../arbitration/dto/arbitration-response';
import { UserRole } from '../../users/entities/user-role.enum';
import { EscrowRole } from '../../escrow/entities/escrow-role.enum';
import { KycTier } from '../../kyc/entities/kyc-tier.enum';
import { KycVerificationStatus } from '../../kyc/entities/kyc-verification-status.enum';
import { Currency } from '../../common/money/currency';
import { EntryDirection } from '../../ledger/entities/entry-direction.enum';

export interface WhatsappTransactionalSettingsResponse {
  whatsappTransactionalEnabled: boolean;
}

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

export type {
  AdminEscrowResponse,
  AdminPaymentIntentResponse,
  AdminPayoutResponse,
  AdminRiskItemResponse,
};

const UNKNOWN_EMAIL = 'unknown';

export function toAdminEscrowResponse(
  escrow: Escrow,
  terms: EscrowTerms | null,
  parties: EscrowParty[],
  emailsByUserId: Map<string, string>,
): AdminEscrowResponse {
  return {
    id: escrow.id,
    state: escrow.state,
    price: terms ? { amount: terms.priceAmount, currency: terms.priceCurrency } : null,
    itemDescription: terms ? terms.itemDescription : null,
    inspectionWindowHours: terms ? terms.inspectionWindowHours : null,
    requiresVerification: terms ? terms.requiresVerification : false,
    parties: parties.map((party) => ({
      userId: party.userId,
      email: emailsByUserId.get(party.userId) ?? UNKNOWN_EMAIL,
      role: party.role,
      termsAcceptedAt: party.termsAcceptedAt,
    })),
    trackingReference: escrow.trackingReference,
    deliveredAt: escrow.deliveredAt,
    createdAt: escrow.createdAt,
    updatedAt: escrow.updatedAt,
  };
}

export function toAdminPayoutResponse(
  payout: Payout,
  emailsByUserId: Map<string, string>,
): AdminPayoutResponse {
  return {
    id: payout.id,
    sellerId: payout.sellerId,
    sellerEmail: emailsByUserId.get(payout.sellerId) ?? UNKNOWN_EMAIL,
    amount: { amount: payout.amount, currency: payout.currency },
    status: payout.status,
    provider: payout.provider,
    reference: payout.providerReference,
    createdAt: payout.createdAt,
    updatedAt: payout.updatedAt,
  };
}

export function toAdminPaymentIntentResponse(
  intent: PaymentIntent,
  emailsByUserId: Map<string, string>,
): AdminPaymentIntentResponse {
  return {
    id: intent.id,
    escrowId: intent.escrowId,
    buyerId: intent.buyerId,
    buyerEmail: emailsByUserId.get(intent.buyerId) ?? UNKNOWN_EMAIL,
    amount: { amount: intent.amount, currency: intent.currency },
    status: intent.status,
    provider: intent.provider,
    reference: intent.providerReference,
    createdAt: intent.createdAt,
    updatedAt: intent.updatedAt,
  };
}

export function toAdminUserListItemResponse(user: User): AdminUserListItemResponse {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
    kycTier: user.kycTier,
    createdAt: user.createdAt,
  };
}

export interface AdminUserDetailData {
  user: User;
  escrows: { escrow: Escrow; terms: EscrowTerms | null; role: EscrowRole }[];
  disputes: Dispute[];
  paymentIntents: PaymentIntent[];
  payouts: PayoutResponse[];
}

export function toAdminUserDetailResponse(data: AdminUserDetailData): AdminUserDetailResponse {
  const { user } = data;

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
    kycTier: user.kycTier,
    phone: user.phone,
    businessName: user.businessName,
    emailVerifiedAt: user.emailVerifiedAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    escrows: data.escrows.map(({ escrow, terms, role }) => ({
      id: escrow.id,
      state: escrow.state,
      role,
      itemDescription: terms ? terms.itemDescription : null,
      price: terms ? { amount: terms.priceAmount, currency: terms.priceCurrency } : null,
      updatedAt: escrow.updatedAt,
    })),
    disputes: data.disputes.map((dispute) => ({
      id: dispute.id,
      escrowId: dispute.escrowId,
      state: dispute.state,
      createdAt: dispute.createdAt,
    })),
    paymentIntents: data.paymentIntents.map((intent) => ({
      id: intent.id,
      escrowId: intent.escrowId,
      amount: { amount: intent.amount, currency: intent.currency },
      status: intent.status,
      createdAt: intent.createdAt,
    })),
    payouts: data.payouts.map((payout) => ({
      id: payout.id,
      amount: { amount: payout.amount, currency: payout.currency },
      status: payout.status,
      createdAt: payout.createdAt,
    })),
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

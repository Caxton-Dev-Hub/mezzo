import { Dispute } from '../../database/entities/dispute.entity';
import { DisputeEvent } from '../../database/entities/dispute-event.entity';
import { EscrowEvent } from '../../database/entities/escrow-event.entity';
import { DisputeReasonCode } from '../entities/dispute-reason-code.enum';
import { DisputeState } from '../entities/dispute-state.enum';
import { DisputeResolutionOutcome } from '../entities/dispute-resolution-outcome.enum';
import { EscrowTermsResponse } from '../../escrow/dto/escrow-response';
import { EvidenceItemResponse } from '../../evidence/dto/evidence-response';
import { ChatMessageResponse } from '../../chat/dto/chat-response';
import { Currency } from '../../common/money/currency';

export interface DisputeResponse {
  id: string;
  escrowId: string;
  raisedByUserId: string;
  reasonCode: DisputeReasonCode;
  statement: string;
  state: DisputeState;
  evidenceWindowExpiresAt: Date;
  resolvedOutcome: DisputeResolutionOutcome | null;
  resolvedByUserId: string | null;
  resolvedAt: Date | null;
  resolvedSellerAmount: number | null;
  resolvedBuyerAmount: number | null;
  resolvedFeeAmount: number | null;
  resolvedCurrency: Currency | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toDisputeResponse(dispute: Dispute): DisputeResponse {
  return {
    id: dispute.id,
    escrowId: dispute.escrowId,
    raisedByUserId: dispute.raisedByUserId,
    reasonCode: dispute.reasonCode,
    statement: dispute.statement,
    state: dispute.state,
    evidenceWindowExpiresAt: dispute.evidenceWindowExpiresAt,
    resolvedOutcome: dispute.resolvedOutcome,
    resolvedByUserId: dispute.resolvedByUserId,
    resolvedAt: dispute.resolvedAt,
    resolvedSellerAmount: dispute.resolvedSellerAmount,
    resolvedBuyerAmount: dispute.resolvedBuyerAmount,
    resolvedFeeAmount: dispute.resolvedFeeAmount,
    resolvedCurrency: dispute.resolvedCurrency,
    createdAt: dispute.createdAt,
    updatedAt: dispute.updatedAt,
  };
}

export interface TimelineEntry {
  source: 'ESCROW' | 'DISPUTE';
  fromState: string;
  toState: string;
  actorId: string | null;
  reason: string | null;
  correlationId: string;
  createdAt: Date;
}

export function toTimeline(escrowEvents: EscrowEvent[], disputeEvents: DisputeEvent[]): TimelineEntry[] {
  const escrowEntries: TimelineEntry[] = escrowEvents.map((event) => ({
    source: 'ESCROW',
    fromState: event.fromState,
    toState: event.toState,
    actorId: event.actorId,
    reason: event.reason,
    correlationId: event.correlationId,
    createdAt: event.createdAt,
  }));

  const disputeEntries: TimelineEntry[] = disputeEvents.map((event) => ({
    source: 'DISPUTE',
    fromState: event.fromState,
    toState: event.toState,
    actorId: event.actorId,
    reason: event.reason,
    correlationId: event.correlationId,
    createdAt: event.createdAt,
  }));

  return [...escrowEntries, ...disputeEntries].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
}

export interface SubmissionFlags {
  buyerSubmitted: boolean;
  sellerSubmitted: boolean;
  evidenceWindowElapsed: boolean;
}

export interface DisputePacketResponse {
  dispute: DisputeResponse;
  frozenTerms: EscrowTermsResponse;
  timeline: TimelineEntry[];
  creationEvidence: EvidenceItemResponse[];
  buyerEvidence: EvidenceItemResponse[];
  sellerEvidence: EvidenceItemResponse[];
  submissionFlags: SubmissionFlags;
  chatTranscript: ChatMessageResponse[];
}

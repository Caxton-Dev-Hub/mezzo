import {
  DisputePacketResponse,
  DisputeResponse,
  DisputeSubmissionFlags,
  DisputeTimelineEntry,
} from '@mezzo/shared-types';
import { Dispute } from '../../database/entities/dispute.entity';
import { DisputeEvent } from '../../database/entities/dispute-event.entity';
import { EscrowEvent } from '../../database/entities/escrow-event.entity';

export type {
  DisputePacketResponse,
  DisputeResponse,
  DisputeSubmissionFlags as SubmissionFlags,
  DisputeTimelineEntry as TimelineEntry,
};

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
    resolvedArbitrationRecordId: dispute.resolvedArbitrationRecordId,
    createdAt: dispute.createdAt,
    updatedAt: dispute.updatedAt,
  };
}

export function toTimeline(
  escrowEvents: EscrowEvent[],
  disputeEvents: DisputeEvent[],
): DisputeTimelineEntry[] {
  const escrowEntries: DisputeTimelineEntry[] = escrowEvents.map((event) => ({
    source: 'ESCROW',
    fromState: event.fromState,
    toState: event.toState,
    actorId: event.actorId,
    reason: event.reason,
    correlationId: event.correlationId,
    createdAt: event.createdAt,
  }));

  const disputeEntries: DisputeTimelineEntry[] = disputeEvents.map((event) => ({
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

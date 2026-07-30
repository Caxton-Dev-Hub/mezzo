import type {
  DisputeReasonCode,
  DisputeResolutionOutcome,
  DisputeState,
} from '@mezzo/shared-types';

export const DISPUTE_REASON_LABELS: Record<DisputeReasonCode, string> = {
  NOT_RECEIVED: 'Item not received',
  NOT_AS_DESCRIBED: 'Not as described',
  DAMAGED: 'Arrived damaged',
  WRONG_ITEM: 'Wrong item',
  PARTIAL: 'Partial delivery',
};

export const DISPUTE_STATE_LABELS: Record<DisputeState, string> = {
  OPEN: 'Dispute opened',
  EVIDENCE: 'Collecting evidence',
  UNDER_REVIEW: 'Under review',
  RESOLVED: 'Resolved',
};

export const DISPUTE_STATE_ORDER: readonly DisputeState[] = [
  'OPEN',
  'EVIDENCE',
  'UNDER_REVIEW',
  'RESOLVED',
];

export const DISPUTE_OUTCOME_LABELS: Record<DisputeResolutionOutcome, string> = {
  RELEASE_TO_SELLER: 'Released to the seller',
  REFUND_TO_BUYER: 'Refunded to the buyer',
  SPLIT: 'Split between both parties',
};

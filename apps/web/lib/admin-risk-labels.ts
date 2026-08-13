import type { AdminRiskKind, AdminRiskReason } from '@mezzo/shared-types';

export const RISK_REASON_LABELS: Record<AdminRiskReason, string> = {
  AWAITING_COUNTERPARTY: 'Counterparty never joined',
  FUNDED_NOT_SHIPPED: 'Funded but not shipped',
  INSPECTION_OVERDUE: 'Inspection window closed without release',
  DISPUTE_OPEN: 'Dispute open past its evidence window',
  RESOLUTION_NOT_SETTLED: 'Resolved but funds not settled',
  PAYOUT_STUCK: 'Payout still pending with the provider',
  PAYOUT_FAILED: 'Payout failed',
  PAYMENT_INTENT_STUCK: 'Payment never completed',
  PAYMENT_QUARANTINED: 'Payment quarantined',
};

export const RISK_KIND_LABELS: Record<AdminRiskKind, string> = {
  ESCROW: 'Escrow',
  PAYOUT: 'Payout',
  PAYMENT_INTENT: 'Payment',
};

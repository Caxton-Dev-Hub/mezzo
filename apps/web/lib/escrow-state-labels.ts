import type { EscrowState } from '@mezzo/shared-types';

export const ESCROW_STATE_LABELS: Record<EscrowState, string> = {
  DRAFT: 'Draft created',
  PENDING_COUNTERPARTY: 'Waiting for counterparty',
  AGREED: 'Terms agreed',
  FUNDED: 'Payment funded',
  SHIPPED: 'Marked as shipped',
  DELIVERED: 'Delivery confirmed',
  RELEASED: 'Funds released',
  DISPUTED: 'Dispute raised',
  RESOLVED_RELEASE: 'Arbiter resolved: release',
  RESOLVED_REFUND: 'Arbiter resolved: refund',
  REFUNDED: 'Funds refunded',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
};

export const ESCROW_BRANCH_STATES: ReadonlySet<EscrowState> = new Set([
  'DISPUTED',
  'RESOLVED_RELEASE',
  'RESOLVED_REFUND',
  'REFUNDED',
  'CANCELLED',
  'EXPIRED',
]);

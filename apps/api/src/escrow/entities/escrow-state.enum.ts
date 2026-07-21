export enum EscrowState {
  DRAFT = 'DRAFT',
  PENDING_COUNTERPARTY = 'PENDING_COUNTERPARTY',
  AGREED = 'AGREED',
  FUNDED = 'FUNDED',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  RELEASED = 'RELEASED',
  DISPUTED = 'DISPUTED',
  RESOLVED_RELEASE = 'RESOLVED_RELEASE',
  RESOLVED_REFUND = 'RESOLVED_REFUND',
  REFUNDED = 'REFUNDED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

const TERMINAL_STATES: ReadonlySet<EscrowState> = new Set([
  EscrowState.RELEASED,
  EscrowState.REFUNDED,
  EscrowState.CANCELLED,
  EscrowState.EXPIRED,
]);

export function isTerminalState(state: EscrowState): boolean {
  return TERMINAL_STATES.has(state);
}

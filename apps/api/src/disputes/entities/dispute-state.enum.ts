export enum DisputeState {
  OPEN = 'OPEN',
  EVIDENCE = 'EVIDENCE',
  UNDER_REVIEW = 'UNDER_REVIEW',
  RESOLVED = 'RESOLVED',
}

const TERMINAL_STATES: ReadonlySet<DisputeState> = new Set([DisputeState.RESOLVED]);

export function isTerminalDisputeState(state: DisputeState): boolean {
  return TERMINAL_STATES.has(state);
}

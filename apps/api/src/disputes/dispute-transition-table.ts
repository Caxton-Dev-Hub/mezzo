import { DisputeState } from './entities/dispute-state.enum';

export interface DisputeTransitionRule {
  to: DisputeState;
}

export const DISPUTE_TRANSITION_TABLE: Readonly<Record<DisputeState, readonly DisputeTransitionRule[]>> = {
  [DisputeState.OPEN]: [{ to: DisputeState.EVIDENCE }],
  [DisputeState.EVIDENCE]: [{ to: DisputeState.UNDER_REVIEW }],
  [DisputeState.UNDER_REVIEW]: [{ to: DisputeState.RESOLVED }],
  [DisputeState.RESOLVED]: [],
};

export function findDisputeTransitionRule(
  from: DisputeState,
  to: DisputeState,
): DisputeTransitionRule | undefined {
  return DISPUTE_TRANSITION_TABLE[from].find((rule) => rule.to === to);
}

export function getLegalNextDisputeStates(from: DisputeState): DisputeState[] {
  return DISPUTE_TRANSITION_TABLE[from].map((rule) => rule.to);
}

import { DISPUTE_TRANSITION_TABLE, findDisputeTransitionRule, getLegalNextDisputeStates } from './dispute-transition-table';
import { DisputeState, isTerminalDisputeState } from './entities/dispute-state.enum';

describe('DISPUTE_TRANSITION_TABLE', () => {
  it('has an entry for every declared state', () => {
    const declaredStates = Object.values(DisputeState);
    expect(Object.keys(DISPUTE_TRANSITION_TABLE).sort()).toEqual([...declaredStates].sort());
  });

  it('gives every terminal state zero legal next states', () => {
    for (const state of Object.values(DisputeState)) {
      if (isTerminalDisputeState(state)) {
        expect(getLegalNextDisputeStates(state)).toEqual([]);
      }
    }
  });

  it.each([
    [DisputeState.OPEN, DisputeState.EVIDENCE],
    [DisputeState.EVIDENCE, DisputeState.UNDER_REVIEW],
    [DisputeState.UNDER_REVIEW, DisputeState.RESOLVED],
  ])('allows the happy-path transition %s -> %s', (from, to) => {
    expect(findDisputeTransitionRule(from, to)).toBeDefined();
  });

  it.each([
    [DisputeState.OPEN, DisputeState.RESOLVED],
    [DisputeState.OPEN, DisputeState.UNDER_REVIEW],
    [DisputeState.EVIDENCE, DisputeState.RESOLVED],
    [DisputeState.RESOLVED, DisputeState.OPEN],
    [DisputeState.RESOLVED, DisputeState.EVIDENCE],
    [DisputeState.RESOLVED, DisputeState.UNDER_REVIEW],
  ])('rejects the illegal transition %s -> %s', (from, to) => {
    expect(findDisputeTransitionRule(from, to)).toBeUndefined();
  });
});

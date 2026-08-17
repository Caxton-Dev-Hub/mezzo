import {
  ESCROW_TRANSITION_TABLE,
  findTransitionRule,
  getLegalNextStates,
  mustBeParty,
} from './escrow-transition-table';
import { EscrowState, isTerminalState } from './entities/escrow-state.enum';
import { NotEscrowPartyError } from './errors/not-escrow-party.error';

describe('ESCROW_TRANSITION_TABLE', () => {
  it('has an entry for every declared state', () => {
    const declaredStates = Object.values(EscrowState);
    expect(Object.keys(ESCROW_TRANSITION_TABLE).sort()).toEqual([...declaredStates].sort());
  });

  it('gives every terminal state zero legal next states', () => {
    for (const state of Object.values(EscrowState)) {
      if (isTerminalState(state)) {
        expect(getLegalNextStates(state)).toEqual([]);
      }
    }
  });

  it.each([
    [EscrowState.DRAFT, EscrowState.PENDING_COUNTERPARTY],
    [EscrowState.PENDING_COUNTERPARTY, EscrowState.AGREED],
    [EscrowState.AGREED, EscrowState.FUNDED],
    [EscrowState.FUNDED, EscrowState.SHIPPED],
    [EscrowState.SHIPPED, EscrowState.DELIVERED],
    [EscrowState.DELIVERED, EscrowState.RELEASED],
  ])('allows the happy-path transition %s -> %s', (from, to) => {
    expect(findTransitionRule(from, to)).toBeDefined();
  });

  it.each([
    [EscrowState.DRAFT, EscrowState.CANCELLED],
    [EscrowState.PENDING_COUNTERPARTY, EscrowState.CANCELLED],
    [EscrowState.AGREED, EscrowState.CANCELLED],
    [EscrowState.FUNDED, EscrowState.DISPUTED],
    [EscrowState.SHIPPED, EscrowState.DISPUTED],
    [EscrowState.DELIVERED, EscrowState.DISPUTED],
    [EscrowState.DISPUTED, EscrowState.RESOLVED_RELEASE],
    [EscrowState.DISPUTED, EscrowState.RESOLVED_REFUND],
    [EscrowState.RESOLVED_RELEASE, EscrowState.RELEASED],
    [EscrowState.RESOLVED_REFUND, EscrowState.REFUNDED],
  ])('allows the branch transition %s -> %s', (from, to) => {
    expect(findTransitionRule(from, to)).toBeDefined();
  });

  it.each([
    [EscrowState.DRAFT, EscrowState.RELEASED],
    [EscrowState.RELEASED, EscrowState.DISPUTED],
    [EscrowState.CANCELLED, EscrowState.FUNDED],
    [EscrowState.REFUNDED, EscrowState.AGREED],
    [EscrowState.EXPIRED, EscrowState.PENDING_COUNTERPARTY],
  ])('rejects the illegal transition %s -> %s', (from, to) => {
    expect(findTransitionRule(from, to)).toBeUndefined();
  });
});

describe('mustBeParty', () => {
  it('throws when there is no actor', () => {
    expect(() => mustBeParty({ actorId: null, partyUserIds: new Set(['u1']) })).toThrow(
      NotEscrowPartyError,
    );
  });

  it('throws when the actor is not a party', () => {
    expect(() => mustBeParty({ actorId: 'stranger', partyUserIds: new Set(['u1', 'u2']) })).toThrow(
      NotEscrowPartyError,
    );
  });

  it('passes when the actor is a party', () => {
    expect(() => mustBeParty({ actorId: 'u1', partyUserIds: new Set(['u1', 'u2']) })).not.toThrow();
  });
});

import { EscrowState } from './entities/escrow-state.enum';
import { NotEscrowPartyError } from './errors/not-escrow-party.error';

export interface TransitionGuardContext {
  actorId: string | null;
  partyUserIds: ReadonlySet<string>;
}

export type TransitionGuard = (context: TransitionGuardContext) => void;

export interface TransitionRule {
  to: EscrowState;
  guard?: TransitionGuard;
}

export const mustBeParty: TransitionGuard = ({ actorId, partyUserIds }) => {
  if (!actorId || !partyUserIds.has(actorId)) {
    throw new NotEscrowPartyError();
  }
};

export const ESCROW_TRANSITION_TABLE: Readonly<Record<EscrowState, readonly TransitionRule[]>> = {
  [EscrowState.DRAFT]: [
    { to: EscrowState.PENDING_COUNTERPARTY, guard: mustBeParty },
    { to: EscrowState.CANCELLED, guard: mustBeParty },
    { to: EscrowState.EXPIRED },
  ],
  [EscrowState.PENDING_COUNTERPARTY]: [
    { to: EscrowState.AGREED },
    { to: EscrowState.CANCELLED, guard: mustBeParty },
    { to: EscrowState.EXPIRED },
  ],
  [EscrowState.AGREED]: [
    { to: EscrowState.FUNDED },
    { to: EscrowState.CANCELLED, guard: mustBeParty },
  ],
  [EscrowState.FUNDED]: [{ to: EscrowState.SHIPPED }, { to: EscrowState.DISPUTED }],
  [EscrowState.SHIPPED]: [{ to: EscrowState.DELIVERED }, { to: EscrowState.DISPUTED }],
  [EscrowState.DELIVERED]: [{ to: EscrowState.RELEASED }, { to: EscrowState.DISPUTED }],
  [EscrowState.DISPUTED]: [
    { to: EscrowState.RESOLVED_RELEASE },
    { to: EscrowState.RESOLVED_REFUND },
  ],
  [EscrowState.RESOLVED_RELEASE]: [{ to: EscrowState.RELEASED }],
  [EscrowState.RESOLVED_REFUND]: [{ to: EscrowState.REFUNDED }],
  [EscrowState.RELEASED]: [],
  [EscrowState.REFUNDED]: [],
  [EscrowState.CANCELLED]: [],
  [EscrowState.EXPIRED]: [],
};

export function findTransitionRule(from: EscrowState, to: EscrowState): TransitionRule | undefined {
  return ESCROW_TRANSITION_TABLE[from].find((rule) => rule.to === to);
}

export function getLegalNextStates(from: EscrowState): EscrowState[] {
  return ESCROW_TRANSITION_TABLE[from].map((rule) => rule.to);
}

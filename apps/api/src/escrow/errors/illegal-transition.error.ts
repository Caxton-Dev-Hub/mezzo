import { DomainError } from '../../common/errors/domain-error';
import { EscrowState } from '../entities/escrow-state.enum';

export class IllegalTransitionError extends DomainError {
  readonly code = 'ILLEGAL_ESCROW_TRANSITION';
  readonly statusCode = 409;

  constructor(from: EscrowState, to: EscrowState) {
    super(`Cannot transition escrow from ${from} to ${to}`, { from, to });
  }
}

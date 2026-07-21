import { DomainError } from '../../common/errors/domain-error';
import { DisputeState } from '../entities/dispute-state.enum';

export class IllegalDisputeTransitionError extends DomainError {
  readonly code = 'ILLEGAL_DISPUTE_TRANSITION';
  readonly statusCode = 409;

  constructor(from: DisputeState, to: DisputeState) {
    super(`Cannot transition dispute from ${from} to ${to}`, { from, to });
  }
}

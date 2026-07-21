import { DomainError } from '../../common/errors/domain-error';
import { EscrowState } from '../../escrow/entities/escrow-state.enum';

export class EscrowNotAgreedError extends DomainError {
  readonly code = 'ESCROW_NOT_AGREED';
  readonly statusCode = 409;

  constructor(currentState: EscrowState) {
    super(`Escrow must be AGREED to fund, but is ${currentState}`, { currentState });
  }
}

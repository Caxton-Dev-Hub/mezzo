import { DomainError } from '../../common/errors/domain-error';
import { EscrowState } from '../../escrow/entities/escrow-state.enum';

export class StellarFundingUnavailableError extends DomainError {
  readonly code = 'STELLAR_FUNDING_UNAVAILABLE';
  readonly statusCode = 409;

  constructor(state: EscrowState) {
    super(`An escrow in ${state} cannot open a Stellar deposit`, { state });
  }
}

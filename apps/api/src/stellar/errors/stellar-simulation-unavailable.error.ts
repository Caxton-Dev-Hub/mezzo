import { DomainError } from '../../common/errors/domain-error';

export class StellarSimulationUnavailableError extends DomainError {
  readonly code = 'STELLAR_SIMULATION_UNAVAILABLE';
  readonly statusCode = 403;

  constructor() {
    super('Deposits can only be simulated against a simulated Stellar network');
  }
}

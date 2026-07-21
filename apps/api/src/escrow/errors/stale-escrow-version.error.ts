import { DomainError } from '../../common/errors/domain-error';

export class StaleEscrowVersionError extends DomainError {
  readonly code = 'STALE_ESCROW_VERSION';
  readonly statusCode = 409;

  constructor() {
    super('This escrow was modified concurrently; reload and retry');
  }
}

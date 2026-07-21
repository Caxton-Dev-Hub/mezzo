import { DomainError } from '../../common/errors/domain-error';

export class StaleDisputeVersionError extends DomainError {
  readonly code = 'STALE_DISPUTE_VERSION';
  readonly statusCode = 409;

  constructor() {
    super('This dispute was modified concurrently; reload and retry');
  }
}

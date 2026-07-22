import { DomainError } from '../../common/errors/domain-error';

export class DisputeAlreadyResolvedError extends DomainError {
  readonly code = 'DISPUTE_ALREADY_RESOLVED';
  readonly statusCode = 409;

  constructor() {
    super('Cannot request an arbitration recommendation for an already-resolved dispute');
  }
}

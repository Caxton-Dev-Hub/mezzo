import { DomainError } from '../../common/errors/domain-error';

export class MissingDisputeEvidenceError extends DomainError {
  readonly code = 'MISSING_DISPUTE_EVIDENCE';
  readonly statusCode = 400;

  constructor() {
    super('Raising a dispute requires at least one AT_DELIVERY evidence item');
  }
}

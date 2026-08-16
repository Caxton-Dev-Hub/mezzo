import { DomainError } from '../../common/errors/domain-error';

export class IntentNotQuarantinedError extends DomainError {
  readonly code = 'INTENT_NOT_QUARANTINED';
  readonly statusCode = 409;

  constructor() {
    super('Only a quarantined payment intent can have its quarantine resolved');
  }
}

import { DomainError } from '../../common/errors/domain-error';

export class UnknownArbitrationRecordError extends DomainError {
  readonly code = 'UNKNOWN_ARBITRATION_RECORD';
  readonly statusCode = 400;

  constructor() {
    super('The referenced arbitration record does not exist for this dispute');
  }
}

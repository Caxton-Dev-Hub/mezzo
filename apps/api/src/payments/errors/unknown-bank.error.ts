import { DomainError } from '../../common/errors/domain-error';

export class UnknownBankError extends DomainError {
  readonly code = 'UNKNOWN_BANK';
  readonly statusCode = 422;

  constructor() {
    super('Select a bank from the provided list');
  }
}

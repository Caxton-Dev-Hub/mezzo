import { DomainError } from '../../common/errors/domain-error';

export class EmailAlreadyRegisteredError extends DomainError {
  readonly code = 'EMAIL_ALREADY_REGISTERED';
  readonly statusCode = 409;

  constructor() {
    super('An account with this email already exists');
  }
}

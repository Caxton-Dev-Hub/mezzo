import { DomainError } from '../../common/errors/domain-error';

export class InvalidCredentialsError extends DomainError {
  readonly code = 'INVALID_CREDENTIALS';
  readonly statusCode = 401;

  constructor() {
    super('Invalid email or password');
  }
}

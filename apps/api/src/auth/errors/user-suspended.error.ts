import { DomainError } from '../../common/errors/domain-error';

export class UserSuspendedError extends DomainError {
  readonly code = 'USER_SUSPENDED';
  readonly statusCode = 403;

  constructor() {
    super('This account has been suspended');
  }
}

import { DomainError } from '../../common/errors/domain-error';

export class EmailNotVerifiedError extends DomainError {
  readonly code = 'EMAIL_NOT_VERIFIED';
  readonly statusCode = 403;

  constructor() {
    super('Verify your email address before signing in');
  }
}

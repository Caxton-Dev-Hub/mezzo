import { DomainError } from '../../common/errors/domain-error';

export class GoogleEmailNotVerifiedError extends DomainError {
  readonly code = 'GOOGLE_EMAIL_NOT_VERIFIED';
  readonly statusCode = 403;

  constructor() {
    super('Verify your email address with Google before signing in');
  }
}

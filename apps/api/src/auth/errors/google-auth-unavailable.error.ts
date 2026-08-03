import { DomainError } from '../../common/errors/domain-error';

export class GoogleAuthUnavailableError extends DomainError {
  readonly code = 'GOOGLE_AUTH_UNAVAILABLE';
  readonly statusCode = 503;

  constructor() {
    super('Google sign-in is temporarily unavailable');
  }
}

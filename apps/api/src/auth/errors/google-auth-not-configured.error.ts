import { DomainError } from '../../common/errors/domain-error';

export class GoogleAuthNotConfiguredError extends DomainError {
  readonly code = 'GOOGLE_AUTH_NOT_CONFIGURED';
  readonly statusCode = 503;

  constructor() {
    super('Google sign-in is not enabled on this server');
  }
}

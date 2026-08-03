import { DomainError } from '../../common/errors/domain-error';

export class InvalidGoogleTokenError extends DomainError {
  readonly code = 'INVALID_GOOGLE_TOKEN';
  readonly statusCode = 401;

  constructor() {
    super('Google sign-in could not be verified');
  }
}

import { DomainError } from '../../common/errors/domain-error';

export class InvalidPasswordResetTokenError extends DomainError {
  readonly code = 'INVALID_PASSWORD_RESET_TOKEN';
  readonly statusCode = 400;

  constructor() {
    super('This password reset link is invalid or has expired');
  }
}

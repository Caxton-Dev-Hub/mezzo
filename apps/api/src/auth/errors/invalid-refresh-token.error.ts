import { DomainError } from '../../common/errors/domain-error';

export class InvalidRefreshTokenError extends DomainError {
  readonly code = 'INVALID_REFRESH_TOKEN';
  readonly statusCode = 401;

  constructor() {
    super('Invalid or expired refresh token');
  }
}

import { DomainError } from '../../common/errors/domain-error';

export class RefreshTokenReusedError extends DomainError {
  readonly code = 'REFRESH_TOKEN_REUSED';
  readonly statusCode = 401;

  constructor() {
    super('Refresh token reuse detected; token family revoked');
  }
}

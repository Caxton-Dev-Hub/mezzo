import { DomainError } from '../../common/errors/domain-error';

export class InvalidVerificationCodeError extends DomainError {
  readonly code = 'INVALID_VERIFICATION_CODE';
  readonly statusCode = 400;

  constructor() {
    super('This verification code is invalid or has expired');
  }
}

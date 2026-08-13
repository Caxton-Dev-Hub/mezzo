import { DomainError } from '../../common/errors/domain-error';

export class VerificationDisabledError extends DomainError {
  readonly code = 'VERIFICATION_DISABLED';
  readonly statusCode = 409;

  constructor() {
    super('Identity verification is not available yet');
  }
}

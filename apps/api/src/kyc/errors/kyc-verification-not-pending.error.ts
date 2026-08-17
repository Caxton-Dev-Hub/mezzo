import { DomainError } from '../../common/errors/domain-error';

export class KycVerificationNotPendingError extends DomainError {
  readonly code = 'KYC_VERIFICATION_NOT_PENDING';
  readonly statusCode = 409;

  constructor() {
    super('This verification has already been reviewed');
  }
}

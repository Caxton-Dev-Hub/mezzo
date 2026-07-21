import { DomainError } from '../../common/errors/domain-error';

export class UnknownKycVerificationError extends DomainError {
  readonly code = 'UNKNOWN_KYC_VERIFICATION';
  readonly statusCode = 404;

  constructor() {
    super('No KYC verification found for this provider reference');
  }
}

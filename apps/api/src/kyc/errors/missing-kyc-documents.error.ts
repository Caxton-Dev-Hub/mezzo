import { DomainError } from '../../common/errors/domain-error';

export class MissingKycDocumentsError extends DomainError {
  readonly code = 'MISSING_KYC_DOCUMENTS';
  readonly statusCode = 422;

  constructor() {
    super('One or more of the submitted documents could not be found for this submission');
  }
}

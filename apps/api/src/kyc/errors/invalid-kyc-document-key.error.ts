import { DomainError } from '../../common/errors/domain-error';

export class InvalidKycDocumentKeyError extends DomainError {
  readonly code = 'INVALID_KYC_DOCUMENT_KEY';
  readonly statusCode = 400;

  constructor() {
    super('This storage key does not belong to the requesting user');
  }
}

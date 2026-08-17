import { DomainError } from '../../common/errors/domain-error';

export class KycDocumentMimeMismatchError extends DomainError {
  readonly code = 'KYC_DOCUMENT_MIME_MISMATCH';
  readonly statusCode = 422;

  constructor(declaredMime: string, detectedMime: string | null) {
    super('The declared file type does not match the uploaded content', {
      declaredMime,
      detectedMime,
    });
  }
}

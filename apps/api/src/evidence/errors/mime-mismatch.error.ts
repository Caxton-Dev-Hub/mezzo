import { DomainError } from '../../common/errors/domain-error';

export class MimeMismatchError extends DomainError {
  readonly code = 'MIME_MISMATCH';
  readonly statusCode = 422;

  constructor(declaredMime: string, detectedMime: string | null) {
    super('The declared file type does not match the uploaded content', {
      declaredMime,
      detectedMime,
    });
  }
}

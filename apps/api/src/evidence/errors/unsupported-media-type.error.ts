import { DomainError } from '../../common/errors/domain-error';

export class UnsupportedMediaTypeError extends DomainError {
  readonly code = 'UNSUPPORTED_MEDIA_TYPE';
  readonly statusCode = 415;

  constructor(mimeType: string) {
    super(`${mimeType} is not an accepted evidence media type`, { mimeType });
  }
}

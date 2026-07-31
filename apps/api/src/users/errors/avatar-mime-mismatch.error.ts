import { DomainError } from '../../common/errors/domain-error';

export class AvatarMimeMismatchError extends DomainError {
  readonly code = 'AVATAR_MIME_MISMATCH';
  readonly statusCode = 422;

  constructor(declaredMime: string, detectedMime: string | null) {
    super('The uploaded avatar is not the image type it claims to be', {
      declaredMime,
      detectedMime,
    });
  }
}

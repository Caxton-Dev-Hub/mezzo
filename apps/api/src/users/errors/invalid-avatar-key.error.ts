import { DomainError } from '../../common/errors/domain-error';

export class InvalidAvatarKeyError extends DomainError {
  readonly code = 'INVALID_AVATAR_KEY';
  readonly statusCode = 400;

  constructor() {
    super('This storage key does not belong to your avatar uploads');
  }
}

import { DomainError } from '../../common/errors/domain-error';

export class InvalidStorageKeyError extends DomainError {
  readonly code = 'INVALID_STORAGE_KEY';
  readonly statusCode = 400;

  constructor() {
    super('This storage key does not belong to the specified escrow');
  }
}

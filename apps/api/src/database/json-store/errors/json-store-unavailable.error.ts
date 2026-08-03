import { DomainError } from '../../../common/errors/domain-error';

export class JsonStoreUnavailableError extends DomainError {
  readonly code = 'JSON_STORE_UNAVAILABLE';
  readonly statusCode = 503;

  constructor(path: string, reason: string) {
    super('The local JSON store could not be read', { path, reason });
  }
}

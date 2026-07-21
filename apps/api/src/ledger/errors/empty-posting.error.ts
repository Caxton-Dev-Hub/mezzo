import { DomainError } from '../../common/errors/domain-error';

export class EmptyPostingError extends DomainError {
  readonly code = 'EMPTY_POSTING';
  readonly statusCode = 400;

  constructor() {
    super('A posting requires at least two entries');
  }
}

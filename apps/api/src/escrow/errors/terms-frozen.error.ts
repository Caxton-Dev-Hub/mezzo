import { DomainError } from '../../common/errors/domain-error';

export class TermsFrozenError extends DomainError {
  readonly code = 'TERMS_FROZEN';
  readonly statusCode = 409;

  constructor() {
    super('Escrow terms are frozen once the escrow is agreed');
  }
}

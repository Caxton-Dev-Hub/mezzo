import { DomainError } from '../../common/errors/domain-error';

export class EscrowFullError extends DomainError {
  readonly code = 'ESCROW_FULL';
  readonly statusCode = 409;

  constructor() {
    super('This escrow already has a buyer and a seller');
  }
}

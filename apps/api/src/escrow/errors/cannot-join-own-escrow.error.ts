import { DomainError } from '../../common/errors/domain-error';

export class CannotJoinOwnEscrowError extends DomainError {
  readonly code = 'CANNOT_JOIN_OWN_ESCROW';
  readonly statusCode = 400;

  constructor() {
    super('You cannot accept your own invite');
  }
}

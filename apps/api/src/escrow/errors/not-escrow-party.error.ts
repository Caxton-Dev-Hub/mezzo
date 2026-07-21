import { DomainError } from '../../common/errors/domain-error';

export class NotEscrowPartyError extends DomainError {
  readonly code = 'NOT_ESCROW_PARTY';
  readonly statusCode = 403;

  constructor() {
    super('You are not a party to this escrow');
  }
}

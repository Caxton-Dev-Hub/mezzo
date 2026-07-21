import { DomainError } from '../../common/errors/domain-error';

export class OnlyBuyerMayFundError extends DomainError {
  readonly code = 'ONLY_BUYER_MAY_FUND';
  readonly statusCode = 403;

  constructor() {
    super('Only the buyer on this escrow may initiate funding');
  }
}

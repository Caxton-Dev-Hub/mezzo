import { DomainError } from '../../common/errors/domain-error';

export class OnlySellerMayActError extends DomainError {
  readonly code = 'ONLY_SELLER_MAY_ACT';
  readonly statusCode = 403;

  constructor(action: string) {
    super(`Only the seller on this escrow may ${action}`, { action });
  }
}

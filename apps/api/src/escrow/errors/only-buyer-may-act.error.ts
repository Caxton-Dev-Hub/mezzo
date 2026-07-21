import { DomainError } from '../../common/errors/domain-error';

export class OnlyBuyerMayActError extends DomainError {
  readonly code = 'ONLY_BUYER_MAY_ACT';
  readonly statusCode = 403;

  constructor(action: string) {
    super(`Only the buyer on this escrow may ${action}`, { action });
  }
}

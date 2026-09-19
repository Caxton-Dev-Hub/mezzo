import { DomainError } from '../../common/errors/domain-error';

export class StellarSettlementNotStuckError extends DomainError {
  readonly code = 'STELLAR_SETTLEMENT_NOT_STUCK';
  readonly statusCode = 409;

  constructor(escrowId: string) {
    super('That escrow has no Stellar payout awaiting reconciliation', { escrowId });
  }
}

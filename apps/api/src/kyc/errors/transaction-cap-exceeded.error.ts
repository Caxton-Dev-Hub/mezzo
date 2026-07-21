import { DomainError } from '../../common/errors/domain-error';
import { Money } from '../../common/money/money';
import { KycTier } from '../entities/kyc-tier.enum';

export class TransactionCapExceededError extends DomainError {
  readonly code = 'TRANSACTION_CAP_EXCEEDED';
  readonly statusCode = 403;

  constructor(tier: KycTier, cap: Money) {
    super(`Amount exceeds the ${tier} cap of ${cap.amount} ${cap.currency} minor units`, {
      tier,
      cap: cap.toJSON(),
    });
  }
}

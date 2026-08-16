import { DomainError } from '../../common/errors/domain-error';

export class PayoutNotFailedError extends DomainError {
  readonly code = 'PAYOUT_NOT_FAILED';
  readonly statusCode = 409;

  constructor() {
    super('Only a failed payout can be retried');
  }
}

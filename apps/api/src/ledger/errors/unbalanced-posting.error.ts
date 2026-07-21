import { DomainError } from '../../common/errors/domain-error';
import { Currency } from '../../common/money/currency';

export class UnbalancedPostingError extends DomainError {
  readonly code = 'UNBALANCED_POSTING';
  readonly statusCode = 400;

  constructor(currency: Currency, totalDebits: number, totalCredits: number) {
    super(`Posting is unbalanced for ${currency}: debits ${totalDebits} != credits ${totalCredits}`, {
      currency,
      totalDebits,
      totalCredits,
    });
  }
}

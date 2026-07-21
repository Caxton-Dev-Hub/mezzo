import { DomainError } from '../../errors/domain-error';

export class InvalidMoneyAmountError extends DomainError {
  readonly code = 'INVALID_MONEY_AMOUNT';
  readonly statusCode = 400;

  constructor() {
    super('Money amounts must be a non-negative integer number of minor units');
  }
}

import { DomainError } from '../../common/errors/domain-error';

export class PayoutAccountVerificationMismatchError extends DomainError {
  readonly code = 'PAYOUT_ACCOUNT_VERIFICATION_MISMATCH';
  readonly statusCode = 409;

  constructor() {
    super('Your saved payout account no longer verifies against the bank. Re-add it to continue.');
  }
}

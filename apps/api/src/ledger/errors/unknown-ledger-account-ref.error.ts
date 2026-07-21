import { DomainError } from '../../common/errors/domain-error';

export class UnknownLedgerAccountRefError extends DomainError {
  readonly code = 'UNKNOWN_LEDGER_ACCOUNT_REF';
  readonly statusCode = 400;

  constructor(ref: string) {
    super(`"${ref}" does not match any known chart-of-accounts pattern`, { ref });
  }
}

import { DomainError } from '../../common/errors/domain-error';

export type StellarDepositMismatchReason =
  | 'DESTINATION'
  | 'MEMO'
  | 'ASSET'
  | 'AMOUNT'
  | 'ALREADY_APPLIED';

export class StellarDepositMismatchError extends DomainError {
  readonly code = 'STELLAR_DEPOSIT_MISMATCH';
  readonly statusCode = 422;

  constructor(reason: StellarDepositMismatchReason, transactionHash: string) {
    super(`Stellar payment ${transactionHash} does not fund this escrow`, {
      reason,
      transactionHash,
    });
  }
}

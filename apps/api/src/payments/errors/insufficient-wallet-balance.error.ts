import { DomainError } from '../../common/errors/domain-error';

export class InsufficientWalletBalanceError extends DomainError {
  readonly code = 'INSUFFICIENT_WALLET_BALANCE';
  readonly statusCode = 409;

  constructor(available: number, requested: number) {
    super(`Wallet balance ${available} is insufficient for a payout of ${requested}`, {
      available,
      requested,
    });
  }
}

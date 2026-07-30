import { DomainError } from '../../common/errors/domain-error';

export class ReceiptNotAvailableError extends DomainError {
  readonly code = 'RECEIPT_NOT_AVAILABLE';
  readonly statusCode = 400;

  constructor() {
    super("This escrow hasn't been funded yet, so there is no receipt.");
  }
}

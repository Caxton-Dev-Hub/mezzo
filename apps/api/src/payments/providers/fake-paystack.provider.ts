import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  InitializeTransactionInput,
  InitializeTransactionResult,
  InitiateTransferInput,
  InitiateTransferResult,
  PaystackProvider,
  PaystackTransaction,
  TransactionWindow,
} from './paystack-provider.interface';

@Injectable()
export class FakePaystackProvider implements PaystackProvider {
  readonly name = 'paystack';

  private readonly transactions: PaystackTransaction[] = [];

  initializeTransaction(input: InitializeTransactionInput): Promise<InitializeTransactionResult> {
    return Promise.resolve({
      authorizationUrl: `https://checkout.fake-paystack.test/${randomUUID()}`,
      reference: input.reference,
    });
  }

  listTransactions(window: TransactionWindow): Promise<PaystackTransaction[]> {
    return Promise.resolve(
      this.transactions.filter(
        (transaction) =>
          transaction.paidAt !== null &&
          transaction.paidAt >= window.from &&
          transaction.paidAt <= window.to,
      ),
    );
  }

  initiateTransfer(input: InitiateTransferInput): Promise<InitiateTransferResult> {
    return Promise.resolve({
      transferCode: `fake-transfer-${randomUUID()}`,
      reference: input.reference,
    });
  }

  seedTransaction(transaction: PaystackTransaction): void {
    this.transactions.push(transaction);
  }

  reset(): void {
    this.transactions.length = 0;
  }
}

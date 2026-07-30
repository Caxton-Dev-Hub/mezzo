import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  InitializeTransactionInput,
  InitializeTransactionResult,
  InitiateTransferInput,
  InitiateTransferResult,
  PaymentProvider,
  PaymentProviderName,
  ProviderTransaction,
  TransactionWindow,
} from './payment-provider.interface';

@Injectable()
export class FakePaystackProvider implements PaymentProvider {
  readonly name: PaymentProviderName = 'paystack';

  private readonly transactions: ProviderTransaction[] = [];

  initializeTransaction(input: InitializeTransactionInput): Promise<InitializeTransactionResult> {
    return Promise.resolve({
      authorizationUrl: `https://checkout.fake-paystack.test/${randomUUID()}`,
      reference: input.reference,
    });
  }

  listTransactions(window: TransactionWindow): Promise<ProviderTransaction[]> {
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

  seedTransaction(transaction: ProviderTransaction): void {
    this.transactions.push(transaction);
  }

  reset(): void {
    this.transactions.length = 0;
  }
}

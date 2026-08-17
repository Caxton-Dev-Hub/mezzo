import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  Bank,
  InitializeTransactionInput,
  InitializeTransactionResult,
  InitiateTransferInput,
  InitiateTransferResult,
  PaymentProvider,
  PaymentProviderName,
  ProviderTransaction,
  ResolveAccountInput,
  ResolveAccountResult,
  TransactionWindow,
} from './payment-provider.interface';

const FAKE_BANKS: Bank[] = [
  { code: '058', name: 'GTBank' },
  { code: '011', name: 'First Bank of Nigeria' },
  { code: '044', name: 'Access Bank' },
  { code: '057', name: 'Zenith Bank' },
];

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

  listBanks(): Promise<Bank[]> {
    return Promise.resolve(FAKE_BANKS);
  }

  resolveAccount(input: ResolveAccountInput): Promise<ResolveAccountResult> {
    return Promise.resolve({ accountName: `Test Account ${input.accountNumber.slice(-4)}` });
  }

  seedTransaction(transaction: ProviderTransaction): void {
    this.transactions.push(transaction);
  }

  reset(): void {
    this.transactions.length = 0;
  }
}

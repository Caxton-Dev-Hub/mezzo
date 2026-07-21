import { Currency } from '../../common/money/currency';

export const PAYSTACK_PROVIDER = Symbol('PAYSTACK_PROVIDER');

export interface InitializeTransactionInput {
  email: string;
  amountKobo: number;
  currency: Currency;
  reference: string;
  metadata: Record<string, unknown>;
}

export interface InitializeTransactionResult {
  authorizationUrl: string;
  reference: string;
}

export type PaystackTransactionStatus = 'success' | 'failed' | 'abandoned';

export interface PaystackTransaction {
  reference: string;
  amountKobo: number;
  currency: Currency;
  status: PaystackTransactionStatus;
  paidAt: Date | null;
}

export interface TransactionWindow {
  from: Date;
  to: Date;
}

export interface InitiateTransferInput {
  amountKobo: number;
  currency: Currency;
  reference: string;
  accountNumber: string;
  bankCode: string;
  reason?: string;
}

export interface InitiateTransferResult {
  transferCode: string;
  reference: string;
}

export interface PaystackProvider {
  readonly name: string;
  initializeTransaction(input: InitializeTransactionInput): Promise<InitializeTransactionResult>;
  listTransactions(window: TransactionWindow): Promise<PaystackTransaction[]>;
  initiateTransfer(input: InitiateTransferInput): Promise<InitiateTransferResult>;
}

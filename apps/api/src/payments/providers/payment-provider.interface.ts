import { Currency } from '../../common/money/currency';

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export type PaymentProviderName = 'paystack' | 'flutterwave';

export interface InitializeTransactionInput {
  email: string;
  amountKobo: number;
  currency: Currency;
  reference: string;
  escrowId: string;
  metadata: Record<string, unknown>;
}

export interface InitializeTransactionResult {
  authorizationUrl: string;
  reference: string;
}

export type ProviderTransactionStatus = 'success' | 'failed' | 'abandoned';

export interface ProviderTransaction {
  reference: string;
  amountKobo: number;
  currency: Currency;
  status: ProviderTransactionStatus;
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

export interface PaymentProvider {
  readonly name: PaymentProviderName;
  initializeTransaction(input: InitializeTransactionInput): Promise<InitializeTransactionResult>;
  listTransactions(window: TransactionWindow): Promise<ProviderTransaction[]>;
  initiateTransfer(input: InitiateTransferInput): Promise<InitiateTransferResult>;
}

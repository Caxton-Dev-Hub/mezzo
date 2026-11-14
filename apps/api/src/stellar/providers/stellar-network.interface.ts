import { StellarAsset, StellarNetworkName } from '@mezzo/shared-types';

export const STELLAR_NETWORK = Symbol('STELLAR_NETWORK');

export interface StellarDepositAddress {
  accountId: string;
  memo: string;
}

export interface StellarPayment {
  transactionHash: string;
  from: string;
  to: string;
  memo: string | null;
  asset: StellarAsset;
  amount: string;
}

export interface StellarPaymentRequest {
  from: string;
  to: string;
  amount: string;
  memo: string;
}

export interface StellarPreparedPayment {
  transactionHash: string;
  expiresAt: Date;
  submit(): Promise<string>;
}

export interface StellarTransactionOutcome {
  transactionHash: string;
  successful: boolean;
}

export interface StellarNetworkClient {
  readonly name: StellarNetworkName;
  readonly asset: StellarAsset;
  openDepositAddress(escrowId: string): Promise<StellarDepositAddress>;
  findPayment(transactionHash: string): Promise<StellarPayment | null>;
  preparePayment(request: StellarPaymentRequest): Promise<StellarPreparedPayment>;
  findTransaction(transactionHash: string): Promise<StellarTransactionOutcome | null>;
}

export interface SimulatedStellarNetworkClient extends StellarNetworkClient {
  receivePayment(request: StellarPaymentRequest): Promise<StellarPayment>;
}

export function isSimulated(client: StellarNetworkClient): client is SimulatedStellarNetworkClient {
  return typeof (client as SimulatedStellarNetworkClient).receivePayment === 'function';
}

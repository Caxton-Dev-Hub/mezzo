import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  InitializeTransactionInput,
  InitializeTransactionResult,
  InitiateTransferInput,
  InitiateTransferResult,
  PaymentProvider,
  ProviderTransaction,
  ProviderTransactionStatus,
  TransactionWindow,
} from './payment-provider.interface';
import { Currency } from '../../common/money/currency';
import { majorToMinorUnits, minorToMajorUnits } from '../../common/money/minor-units';

interface FlutterwavePaymentResponse {
  status: string;
  data: { link: string };
}

interface FlutterwaveTransferResponse {
  status: string;
  data: { id: number | string; reference: string };
}

interface FlutterwaveListTransactionsResponse {
  status: string;
  data: Array<{
    tx_ref: string;
    amount: number | string;
    currency: string;
    status: string;
    created_at: string | null;
  }>;
}

@Injectable()
export class FlutterwaveHttpProvider implements PaymentProvider {
  readonly name = 'flutterwave';

  constructor(private readonly configService: ConfigService) {}

  async initializeTransaction(
    input: InitializeTransactionInput,
  ): Promise<InitializeTransactionResult> {
    const response = await fetch(`${this.baseUrl()}/payments`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        tx_ref: input.reference,
        amount: minorToMajorUnits(input.amountKobo),
        currency: input.currency,
        redirect_url: this.configService.getOrThrow<string>('FLUTTERWAVE_REDIRECT_URL'),
        customer: { email: input.email },
        meta: input.metadata,
      }),
    });

    if (!response.ok) {
      throw new ServiceUnavailableException('Flutterwave transaction initialization failed');
    }

    const body = (await response.json()) as FlutterwavePaymentResponse;
    return { authorizationUrl: body.data.link, reference: input.reference };
  }

  async listTransactions(window: TransactionWindow): Promise<ProviderTransaction[]> {
    const params = new URLSearchParams({
      from: window.from.toISOString(),
      to: window.to.toISOString(),
    });

    const response = await fetch(`${this.baseUrl()}/transactions?${params.toString()}`, {
      method: 'GET',
      headers: this.headers(),
    });

    if (!response.ok) {
      throw new ServiceUnavailableException('Flutterwave transaction listing failed');
    }

    const body = (await response.json()) as FlutterwaveListTransactionsResponse;
    return body.data.map((transaction) => ({
      reference: transaction.tx_ref,
      amountKobo: majorToMinorUnits(String(transaction.amount)) ?? 0,
      currency: transaction.currency as Currency,
      status: this.mapStatus(transaction.status),
      paidAt: transaction.created_at ? new Date(transaction.created_at) : null,
    }));
  }

  async initiateTransfer(input: InitiateTransferInput): Promise<InitiateTransferResult> {
    const response = await fetch(`${this.baseUrl()}/transfers`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        account_bank: input.bankCode,
        account_number: input.accountNumber,
        amount: minorToMajorUnits(input.amountKobo),
        currency: input.currency,
        reference: input.reference,
        narration: input.reason,
      }),
    });

    if (!response.ok) {
      throw new ServiceUnavailableException('Flutterwave transfer initiation failed');
    }

    const body = (await response.json()) as FlutterwaveTransferResponse;
    return { transferCode: String(body.data.id), reference: body.data.reference };
  }

  private mapStatus(status: string): ProviderTransactionStatus {
    const normalized = status.toLowerCase();
    if (normalized === 'successful') {
      return 'success';
    }
    return normalized === 'pending' ? 'abandoned' : 'failed';
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.configService.getOrThrow<string>('FLUTTERWAVE_SECRET_KEY')}`,
      'Content-Type': 'application/json',
    };
  }

  private baseUrl(): string {
    return this.configService.getOrThrow<string>('FLUTTERWAVE_BASE_URL');
  }
}

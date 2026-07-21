import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  InitializeTransactionInput,
  InitializeTransactionResult,
  PaystackProvider,
  PaystackTransaction,
  PaystackTransactionStatus,
  TransactionWindow,
} from './paystack-provider.interface';
import { Currency } from '../../common/money/currency';

interface PaystackInitializeResponse {
  status: boolean;
  data: { authorization_url: string; reference: string };
}

interface PaystackListTransactionsResponse {
  status: boolean;
  data: Array<{
    reference: string;
    amount: number;
    currency: string;
    status: string;
    paid_at: string | null;
  }>;
}

@Injectable()
export class PaystackHttpProvider implements PaystackProvider {
  readonly name = 'paystack';

  constructor(private readonly configService: ConfigService) {}

  async initializeTransaction(input: InitializeTransactionInput): Promise<InitializeTransactionResult> {
    const response = await fetch(`${this.baseUrl()}/transaction/initialize`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        email: input.email,
        amount: input.amountKobo,
        currency: input.currency,
        reference: input.reference,
        metadata: input.metadata,
      }),
    });

    if (!response.ok) {
      throw new ServiceUnavailableException('Paystack transaction initialization failed');
    }

    const body = (await response.json()) as PaystackInitializeResponse;
    return { authorizationUrl: body.data.authorization_url, reference: body.data.reference };
  }

  async listTransactions(window: TransactionWindow): Promise<PaystackTransaction[]> {
    const params = new URLSearchParams({
      from: window.from.toISOString(),
      to: window.to.toISOString(),
      perPage: '100',
    });

    const response = await fetch(`${this.baseUrl()}/transaction?${params.toString()}`, {
      method: 'GET',
      headers: this.headers(),
    });

    if (!response.ok) {
      throw new ServiceUnavailableException('Paystack transaction listing failed');
    }

    const body = (await response.json()) as PaystackListTransactionsResponse;
    return body.data.map((transaction) => ({
      reference: transaction.reference,
      amountKobo: transaction.amount,
      currency: transaction.currency as Currency,
      status: this.mapStatus(transaction.status),
      paidAt: transaction.paid_at ? new Date(transaction.paid_at) : null,
    }));
  }

  private mapStatus(status: string): PaystackTransactionStatus {
    return status === 'success' || status === 'abandoned' ? status : 'failed';
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.configService.getOrThrow<string>('PAYSTACK_SECRET_KEY')}`,
      'Content-Type': 'application/json',
    };
  }

  private baseUrl(): string {
    return this.configService.getOrThrow<string>('PAYSTACK_BASE_URL');
  }
}

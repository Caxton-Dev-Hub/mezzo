import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  InitializeTransactionInput,
  InitializeTransactionResult,
  InitiateTransferInput,
  InitiateTransferResult,
  PaymentProvider,
  PaymentProviderName,
  ProviderTransaction,
  ProviderTransactionStatus,
  TransactionWindow,
} from './payment-provider.interface';
import { Currency } from '../../common/money/currency';

interface PaystackInitializeResponse {
  status: boolean;
  data: { authorization_url: string; reference: string };
}

interface PaystackRecipientResponse {
  status: boolean;
  data: { recipient_code: string };
}

interface PaystackTransferResponse {
  status: boolean;
  data: { transfer_code: string; reference: string };
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
export class PaystackHttpProvider implements PaymentProvider {
  readonly name: PaymentProviderName = 'paystack';

  private readonly logger = new Logger(PaystackHttpProvider.name);

  constructor(private readonly configService: ConfigService) {}

  async initializeTransaction(
    input: InitializeTransactionInput,
  ): Promise<InitializeTransactionResult> {
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
      throw await this.failure(response, 'Paystack transaction initialization failed');
    }

    const body = (await response.json()) as PaystackInitializeResponse;
    return { authorizationUrl: body.data.authorization_url, reference: body.data.reference };
  }

  async listTransactions(window: TransactionWindow): Promise<ProviderTransaction[]> {
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
      throw await this.failure(response, 'Paystack transaction listing failed');
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

  async initiateTransfer(input: InitiateTransferInput): Promise<InitiateTransferResult> {
    const recipientResponse = await fetch(`${this.baseUrl()}/transferrecipient`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        type: 'nuban',
        name: input.reference,
        account_number: input.accountNumber,
        bank_code: input.bankCode,
        currency: input.currency,
      }),
    });

    if (!recipientResponse.ok) {
      throw await this.failure(recipientResponse, 'Paystack transfer recipient creation failed');
    }

    const recipient = (await recipientResponse.json()) as PaystackRecipientResponse;

    const transferResponse = await fetch(`${this.baseUrl()}/transfer`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        source: 'balance',
        amount: input.amountKobo,
        recipient: recipient.data.recipient_code,
        reference: input.reference,
        reason: input.reason,
      }),
    });

    if (!transferResponse.ok) {
      throw await this.failure(transferResponse, 'Paystack transfer initiation failed');
    }

    const transfer = (await transferResponse.json()) as PaystackTransferResponse;
    return { transferCode: transfer.data.transfer_code, reference: transfer.data.reference };
  }

  private async failure(response: Response, message: string): Promise<ServiceUnavailableException> {
    const body = await response.text().catch(() => '');
    this.logger.error(
      `${message} (${response.status} ${response.statusText}): ${body.slice(0, 500)}`,
    );
    return new ServiceUnavailableException(message);
  }

  private mapStatus(status: string): ProviderTransactionStatus {
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

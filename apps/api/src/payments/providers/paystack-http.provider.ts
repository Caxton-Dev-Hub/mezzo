import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Bank,
  InitializeTransactionInput,
  InitializeTransactionResult,
  InitiateTransferInput,
  InitiateTransferResult,
  PaymentProvider,
  PaymentProviderName,
  ProviderTransaction,
  ProviderTransactionStatus,
  ResolveAccountInput,
  ResolveAccountResult,
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

interface PaystackBanksResponse {
  status: boolean;
  data: Array<{ code: string; name: string }>;
}

interface PaystackResolveAccountResponse {
  status: boolean;
  message: string;
  data: { account_number: string; account_name: string };
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
        callback_url: `${this.configService.getOrThrow<string>('WEB_APP_URL')}/escrow/${input.escrowId}/fund`,
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

  async listBanks(): Promise<Bank[]> {
    const response = await fetch(`${this.baseUrl()}/bank?currency=NGN`, {
      method: 'GET',
      headers: this.headers(),
    });

    if (!response.ok) {
      throw await this.failure(response, 'Paystack bank list retrieval failed');
    }

    const body = (await response.json()) as PaystackBanksResponse;
    return body.data.map((bank) => ({ code: bank.code, name: bank.name }));
  }

  async resolveAccount(input: ResolveAccountInput): Promise<ResolveAccountResult> {
    const params = new URLSearchParams({
      account_number: input.accountNumber,
      bank_code: input.bankCode,
    });
    const response = await fetch(`${this.baseUrl()}/bank/resolve?${params.toString()}`, {
      method: 'GET',
      headers: this.headers(),
    });

    if (!response.ok) {
      throw await this.failure(response, 'Paystack account resolution failed');
    }

    const body = (await response.json()) as PaystackResolveAccountResponse;
    if (!body.status) {
      this.logger.error(`Paystack account resolution failed: ${body.message}`);
      throw new ServiceUnavailableException('Paystack account resolution failed');
    }

    return { accountName: body.data.account_name };
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

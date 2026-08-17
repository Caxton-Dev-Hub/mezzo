import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Bank,
  InitializeTransactionInput,
  InitializeTransactionResult,
  InitiateTransferInput,
  InitiateTransferResult,
  PaymentProvider,
  ProviderTransaction,
  ProviderTransactionStatus,
  ResolveAccountInput,
  ResolveAccountResult,
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
  message: string;
  data: { id: number | string; reference: string } | null;
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

interface FlutterwaveBanksResponse {
  status: string;
  data: Array<{ code: string; name: string }>;
}

interface FlutterwaveResolveAccountResponse {
  status: string;
  message: string;
  data: { account_number: string; account_name: string } | null;
}

@Injectable()
export class FlutterwaveHttpProvider implements PaymentProvider {
  readonly name = 'flutterwave';

  private readonly logger = new Logger(FlutterwaveHttpProvider.name);

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
        redirect_url: `${this.configService.getOrThrow<string>('WEB_APP_URL')}/escrow/${input.escrowId}/fund`,
        customer: { email: input.email },
        meta: input.metadata,
      }),
    });

    if (!response.ok) {
      throw await this.failure(response, 'Flutterwave transaction initialization failed');
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
      throw await this.failure(response, 'Flutterwave transaction listing failed');
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
      throw await this.failure(response, 'Flutterwave transfer initiation failed');
    }

    const body = (await response.json()) as FlutterwaveTransferResponse;
    if (body.status !== 'success' || !body.data) {
      this.logger.error(`Flutterwave transfer initiation failed: ${body.message}`);
      throw new ServiceUnavailableException('Flutterwave transfer initiation failed');
    }

    return { transferCode: String(body.data.id), reference: body.data.reference };
  }

  async listBanks(): Promise<Bank[]> {
    const response = await fetch(`${this.baseUrl()}/banks/NG`, {
      method: 'GET',
      headers: this.headers(),
    });

    if (!response.ok) {
      throw await this.failure(response, 'Flutterwave bank list retrieval failed');
    }

    const body = (await response.json()) as FlutterwaveBanksResponse;
    return body.data.map((bank) => ({ code: bank.code, name: bank.name }));
  }

  async resolveAccount(input: ResolveAccountInput): Promise<ResolveAccountResult> {
    const response = await fetch(`${this.baseUrl()}/accounts/resolve`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        account_number: input.accountNumber,
        account_bank: input.bankCode,
      }),
    });

    if (!response.ok) {
      throw await this.failure(response, 'Flutterwave account resolution failed');
    }

    const body = (await response.json()) as FlutterwaveResolveAccountResponse;
    if (body.status !== 'success' || !body.data) {
      this.logger.error(`Flutterwave account resolution failed: ${body.message}`);
      throw new ServiceUnavailableException('Flutterwave account resolution failed');
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

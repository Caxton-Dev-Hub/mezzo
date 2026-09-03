import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LedgerService } from '../ledger/ledger.service';
import { providerClearingRef } from '../ledger/account-refs';
import { Currency } from '../common/money/currency';
import { Money } from '../common/money/money';
import { FakePaystackProvider } from './providers/fake-paystack.provider';
import { FlutterwaveHttpProvider } from './providers/flutterwave-http.provider';
import { PaystackHttpProvider } from './providers/paystack-http.provider';
import { PaymentProvider, PaymentProviderName } from './providers/payment-provider.interface';

const PLATFORM_CURRENCY: Currency = 'NGN';

export type ProviderFloatStatus =
  'BALANCED' | 'SURPLUS' | 'SHORTFALL' | 'UNCONFIGURED' | 'UNAVAILABLE';

export interface ProviderFloatReport {
  provider: PaymentProviderName;
  status: ProviderFloatStatus;
  clearing: { amount: number; currency: Currency };
  live: { amount: number; currency: Currency } | null;
  drift: { amount: number; currency: Currency } | null;
}

interface FloatCandidate {
  name: PaymentProviderName;
  provider: PaymentProvider | null;
}

@Injectable()
export class ProviderFloatService {
  private readonly logger = new Logger(ProviderFloatService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly ledgerService: LedgerService,
    private readonly fakeProvider: FakePaystackProvider,
    private readonly paystackProvider: PaystackHttpProvider,
    private readonly flutterwaveProvider: FlutterwaveHttpProvider,
  ) {}

  async report(): Promise<ProviderFloatReport[]> {
    return Promise.all(this.candidates().map((candidate) => this.reportFor(candidate)));
  }

  private async reportFor({ name, provider }: FloatCandidate): Promise<ProviderFloatReport> {
    const clearing = await this.ledgerService.getBalanceOrZero(
      providerClearingRef(name),
      PLATFORM_CURRENCY,
    );

    if (!provider) {
      return { provider: name, status: 'UNCONFIGURED', clearing, live: null, drift: null };
    }

    const live = await this.fetchBalance(provider);
    if (!live) {
      return { provider: name, status: 'UNAVAILABLE', clearing, live: null, drift: null };
    }

    const liveMoney = Money.of(live.amountKobo, live.currency);
    const clearingMoney = Money.of(clearing.amount, clearing.currency);

    if (liveMoney.equals(clearingMoney)) {
      return {
        provider: name,
        status: 'BALANCED',
        clearing,
        live: liveMoney.toJSON(),
        drift: Money.zero(PLATFORM_CURRENCY).toJSON(),
      };
    }

    const surplus = liveMoney.greaterThan(clearingMoney);
    const drift = surplus ? liveMoney.subtract(clearingMoney) : clearingMoney.subtract(liveMoney);

    return {
      provider: name,
      status: surplus ? 'SURPLUS' : 'SHORTFALL',
      clearing,
      live: liveMoney.toJSON(),
      drift: drift.toJSON(),
    };
  }

  private async fetchBalance(
    provider: PaymentProvider,
  ): Promise<{ amountKobo: number; currency: Currency } | null> {
    try {
      return await provider.getBalance(PLATFORM_CURRENCY);
    } catch (error) {
      this.logger.error(
        `Provider float check failed for ${provider.name}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return null;
    }
  }

  private candidates(): FloatCandidate[] {
    if (this.configService.get<string>('PAYMENT_PROVIDER') === 'fake') {
      return [
        { name: 'paystack', provider: this.fakeProvider },
        { name: 'flutterwave', provider: null },
      ];
    }

    return [
      {
        name: 'paystack',
        provider: this.isConfigured('PAYSTACK_SECRET_KEY') ? this.paystackProvider : null,
      },
      {
        name: 'flutterwave',
        provider: this.isConfigured('FLUTTERWAVE_SECRET_KEY') ? this.flutterwaveProvider : null,
      },
    ];
  }

  private isConfigured(key: string): boolean {
    const value = this.configService.get<string>(key);
    return typeof value === 'string' && value.length > 0;
  }
}

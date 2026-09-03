import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentIntent } from '../database/entities/payment-intent.entity';
import { PaymentWebhookEvent } from '../database/entities/payment-webhook-event.entity';
import { Payout } from '../database/entities/payout.entity';
import { PayoutAccount } from '../database/entities/payout-account.entity';
import { EscrowModule } from '../escrow/escrow.module';
import { LedgerModule } from '../ledger/ledger.module';
import { KycModule } from '../kyc/kyc.module';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ObservabilityModule } from '../observability/observability.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentsReconciliationService } from './payments-reconciliation.service';
import { ProviderFloatService } from './provider-float.service';
import { PayoutController } from './payout.controller';
import { PayoutService } from './payout.service';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { WebhookSignatureService } from './webhook-signature.service';
import { PAYMENT_PROVIDER, PaymentProvider } from './providers/payment-provider.interface';
import { FakePaystackProvider } from './providers/fake-paystack.provider';
import { PaystackHttpProvider } from './providers/paystack-http.provider';
import { FlutterwaveHttpProvider } from './providers/flutterwave-http.provider';

@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentIntent, PaymentWebhookEvent, Payout, PayoutAccount]),
    EscrowModule,
    LedgerModule,
    KycModule,
    UsersModule,
    NotificationsModule,
    ObservabilityModule,
  ],
  controllers: [PaymentsController, PayoutController, WalletController],
  providers: [
    PaymentsService,
    PaymentsReconciliationService,
    ProviderFloatService,
    PayoutService,
    WalletService,
    WebhookSignatureService,
    FakePaystackProvider,
    PaystackHttpProvider,
    FlutterwaveHttpProvider,
    {
      provide: PAYMENT_PROVIDER,
      inject: [ConfigService, FakePaystackProvider, PaystackHttpProvider, FlutterwaveHttpProvider],
      useFactory: (
        configService: ConfigService,
        fakeProvider: FakePaystackProvider,
        paystackProvider: PaystackHttpProvider,
        flutterwaveProvider: FlutterwaveHttpProvider,
      ): PaymentProvider => {
        switch (configService.get<string>('PAYMENT_PROVIDER')) {
          case 'paystack':
            return paystackProvider;
          case 'flutterwave':
            return flutterwaveProvider;
          default:
            return fakeProvider;
        }
      },
    },
  ],
  exports: [
    PaymentsService,
    PaymentsReconciliationService,
    ProviderFloatService,
    PayoutService,
    WalletService,
    FakePaystackProvider,
  ],
})
export class PaymentsModule {}

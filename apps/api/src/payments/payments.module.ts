import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentIntent } from '../database/entities/payment-intent.entity';
import { PaymentWebhookEvent } from '../database/entities/payment-webhook-event.entity';
import { Payout } from '../database/entities/payout.entity';
import { EscrowModule } from '../escrow/escrow.module';
import { LedgerModule } from '../ledger/ledger.module';
import { KycModule } from '../kyc/kyc.module';
import { UsersModule } from '../users/users.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentsReconciliationService } from './payments-reconciliation.service';
import { PayoutController } from './payout.controller';
import { PayoutService } from './payout.service';
import { WebhookSignatureService } from './webhook-signature.service';
import { PAYSTACK_PROVIDER, PaystackProvider } from './providers/paystack-provider.interface';
import { FakePaystackProvider } from './providers/fake-paystack.provider';
import { PaystackHttpProvider } from './providers/paystack-http.provider';

@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentIntent, PaymentWebhookEvent, Payout]),
    EscrowModule,
    LedgerModule,
    KycModule,
    UsersModule,
  ],
  controllers: [PaymentsController, PayoutController],
  providers: [
    PaymentsService,
    PaymentsReconciliationService,
    PayoutService,
    WebhookSignatureService,
    FakePaystackProvider,
    PaystackHttpProvider,
    {
      provide: PAYSTACK_PROVIDER,
      inject: [ConfigService, FakePaystackProvider, PaystackHttpProvider],
      useFactory: (
        configService: ConfigService,
        fakeProvider: FakePaystackProvider,
        httpProvider: PaystackHttpProvider,
      ): PaystackProvider =>
        configService.get<string>('PAYSTACK_PROVIDER') === 'paystack' ? httpProvider : fakeProvider,
    },
  ],
  exports: [PaymentsService, PaymentsReconciliationService, PayoutService, FakePaystackProvider],
})
export class PaymentsModule {}

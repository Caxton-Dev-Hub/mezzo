import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../database/entities/user.entity';
import { KycVerification } from '../database/entities/kyc-verification.entity';
import { KycEvent } from '../database/entities/kyc-event.entity';
import { KycController } from './kyc.controller';
import { KycService } from './kyc.service';
import { KycCapsService } from './kyc-caps.service';
import { KycWebhookSignatureService } from './webhook-signature.service';
import { KycTierGuard } from './guards/kyc-tier.guard';
import { KYC_PROVIDER, KycProvider } from './providers/kyc-provider.interface';
import { FakeKycProvider } from './providers/fake-kyc.provider';
import { DojahKycProvider } from './providers/dojah-kyc.provider';

@Module({
  imports: [TypeOrmModule.forFeature([User, KycVerification, KycEvent])],
  controllers: [KycController],
  providers: [
    KycService,
    KycCapsService,
    KycWebhookSignatureService,
    KycTierGuard,
    FakeKycProvider,
    DojahKycProvider,
    {
      provide: KYC_PROVIDER,
      inject: [ConfigService, FakeKycProvider, DojahKycProvider],
      useFactory: (
        configService: ConfigService,
        fakeProvider: FakeKycProvider,
        dojahProvider: DojahKycProvider,
      ): KycProvider =>
        configService.get<string>('KYC_PROVIDER') === 'dojah' ? dojahProvider : fakeProvider,
    },
  ],
  exports: [KycService, KycTierGuard],
})
export class KycModule {}

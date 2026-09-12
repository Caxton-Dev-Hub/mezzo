import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StellarAccount } from '../database/entities/stellar-account.entity';
import { StellarEscrow } from '../database/entities/stellar-escrow.entity';
import { EscrowModule } from '../escrow/escrow.module';
import { LedgerModule } from '../ledger/ledger.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StellarController } from './stellar.controller';
import { StellarConfigService } from './stellar-config.service';
import { StellarWalletService } from './stellar-wallet.service';
import { StellarLinkChallengeService } from './stellar-link-challenge.service';
import { StellarEscrowService } from './stellar-escrow.service';
import { StellarSettlementService } from './stellar-settlement.service';
import { FakeStellarProvider } from './providers/fake-stellar.provider';
import { HorizonStellarProvider } from './providers/horizon-stellar.provider';
import { STELLAR_NETWORK, StellarNetworkClient } from './providers/stellar-network.interface';

@Module({
  imports: [
    TypeOrmModule.forFeature([StellarAccount, StellarEscrow]),
    EscrowModule,
    LedgerModule,
    NotificationsModule,
  ],
  controllers: [StellarController],
  providers: [
    StellarConfigService,
    StellarWalletService,
    StellarLinkChallengeService,
    StellarEscrowService,
    StellarSettlementService,
    FakeStellarProvider,
    {
      provide: STELLAR_NETWORK,
      inject: [ConfigService, FakeStellarProvider],
      useFactory: (
        configService: ConfigService,
        fakeProvider: FakeStellarProvider,
      ): StellarNetworkClient =>
        configService.get<string>('STELLAR_MODE') === 'live'
          ? new HorizonStellarProvider(configService)
          : fakeProvider,
    },
  ],
  exports: [StellarConfigService, StellarWalletService, StellarEscrowService],
})
export class StellarModule {}

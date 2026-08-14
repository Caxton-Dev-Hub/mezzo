import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsAppAccount } from '../../database/entities/whatsapp-account.entity';
import { WHATSAPP_CLIENT, WhatsAppClient } from './whatsapp-client.interface';
import { FakeWhatsAppClient } from './fake-whatsapp.client';
import { MetaWhatsAppClient } from './meta-whatsapp.client';

@Module({
  imports: [TypeOrmModule.forFeature([WhatsAppAccount])],
  providers: [
    FakeWhatsAppClient,
    MetaWhatsAppClient,
    {
      provide: WHATSAPP_CLIENT,
      inject: [ConfigService, FakeWhatsAppClient, MetaWhatsAppClient],
      useFactory: (
        configService: ConfigService,
        fakeClient: FakeWhatsAppClient,
        metaClient: MetaWhatsAppClient,
      ): WhatsAppClient =>
        configService.get<string>('WHATSAPP_CLIENT_PROVIDER') === 'meta' ? metaClient : fakeClient,
    },
  ],
  exports: [TypeOrmModule, WHATSAPP_CLIENT, FakeWhatsAppClient],
})
export class WhatsAppClientModule {}

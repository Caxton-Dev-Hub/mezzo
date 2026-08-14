import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Escrow } from '../database/entities/escrow.entity';
import { User } from '../database/entities/user.entity';
import { WhatsAppLinkCode } from '../database/entities/whatsapp-link-code.entity';
import { EscrowModule } from '../escrow/escrow.module';
import { ChatModule } from '../chat/chat.module';
import { AuditModule } from '../audit/audit.module';
import { SettingsModule } from '../settings/settings.module';
import { PasswordService } from '../auth/password.service';
import { WhatsAppClientModule } from './client/whatsapp-client.module';
import { WhatsAppWebhookSignatureService } from './whatsapp-webhook-signature.service';
import { WhatsAppDedupeService } from './whatsapp-dedupe.service';
import { WhatsAppConversationSessionService } from './whatsapp-conversation-session.service';
import { WhatsAppLinkingService } from './whatsapp-linking.service';
import { WhatsAppPinService } from './whatsapp-pin.service';
import { WhatsAppCommandDispatcherService } from './whatsapp-command-dispatcher.service';
import { WhatsAppInboundMessageProcessor } from './whatsapp-inbound-message.processor';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller';
import { WhatsAppLinkController } from './whatsapp-link.controller';
import { WHATSAPP_INBOUND_QUEUE } from './whatsapp-inbound-queue.constants';

@Module({
  imports: [
    TypeOrmModule.forFeature([Escrow, User, WhatsAppLinkCode]),
    BullModule.registerQueue({ name: WHATSAPP_INBOUND_QUEUE }),
    WhatsAppClientModule,
    EscrowModule,
    ChatModule,
    AuditModule,
    SettingsModule,
  ],
  controllers: [WhatsAppWebhookController, WhatsAppLinkController],
  providers: [
    WhatsAppWebhookSignatureService,
    WhatsAppDedupeService,
    WhatsAppConversationSessionService,
    WhatsAppLinkingService,
    WhatsAppPinService,
    PasswordService,
    WhatsAppCommandDispatcherService,
    WhatsAppInboundMessageProcessor,
  ],
  exports: [WhatsAppLinkingService],
})
export class WhatsappModule {}

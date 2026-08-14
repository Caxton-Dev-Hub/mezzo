import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { JwtModule } from '@nestjs/jwt';
import { Notification } from '../database/entities/notification.entity';
import { User } from '../database/entities/user.entity';
import { WhatsAppAccount } from '../database/entities/whatsapp-account.entity';
import { WhatsAppClientModule } from '../whatsapp/client/whatsapp-client.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationDeliveryProcessor } from './notification-delivery.processor';
import { FakeNotificationChannel } from './channels/fake-notification.channel';
import { ResendEmailChannel } from './channels/resend-email.channel';
import { TermiiSmsChannel } from './channels/termii-sms.channel';
import { WhatsAppChannel } from './channels/whatsapp.channel';
import {
  EMAIL_CHANNEL,
  NotificationChannel,
  SMS_CHANNEL,
  WHATSAPP_CHANNEL,
} from './channels/notification-channel.interface';
import { NOTIFICATION_QUEUE } from './notification-queue.constants';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, User, WhatsAppAccount]),
    BullModule.registerQueue({ name: NOTIFICATION_QUEUE }),
    JwtModule.register({}),
    WhatsAppClientModule,
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsGateway,
    NotificationDeliveryProcessor,
    FakeNotificationChannel,
    ResendEmailChannel,
    TermiiSmsChannel,
    WhatsAppChannel,
    {
      provide: EMAIL_CHANNEL,
      inject: [ConfigService, FakeNotificationChannel, ResendEmailChannel],
      useFactory: (
        configService: ConfigService,
        fakeChannel: FakeNotificationChannel,
        resendChannel: ResendEmailChannel,
      ): NotificationChannel =>
        configService.get<string>('NOTIFICATION_EMAIL_PROVIDER') === 'resend' ? resendChannel : fakeChannel,
    },
    {
      provide: SMS_CHANNEL,
      inject: [ConfigService, FakeNotificationChannel, TermiiSmsChannel],
      useFactory: (
        configService: ConfigService,
        fakeChannel: FakeNotificationChannel,
        termiiChannel: TermiiSmsChannel,
      ): NotificationChannel =>
        configService.get<string>('NOTIFICATION_SMS_PROVIDER') === 'termii' ? termiiChannel : fakeChannel,
    },
    { provide: WHATSAPP_CHANNEL, useExisting: WhatsAppChannel },
  ],
  exports: [NotificationsService, FakeNotificationChannel, NotificationsGateway],
})
export class NotificationsModule {}

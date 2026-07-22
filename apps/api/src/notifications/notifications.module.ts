import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Notification } from '../database/entities/notification.entity';
import { User } from '../database/entities/user.entity';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationDeliveryProcessor } from './notification-delivery.processor';
import { FakeNotificationChannel } from './channels/fake-notification.channel';
import { ResendEmailChannel } from './channels/resend-email.channel';
import { TermiiSmsChannel } from './channels/termii-sms.channel';
import {
  EMAIL_CHANNEL,
  NotificationChannel,
  SMS_CHANNEL,
} from './channels/notification-channel.interface';
import { NOTIFICATION_QUEUE } from './notification-queue.constants';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, User]),
    BullModule.registerQueue({ name: NOTIFICATION_QUEUE }),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationDeliveryProcessor,
    FakeNotificationChannel,
    ResendEmailChannel,
    TermiiSmsChannel,
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
  ],
  exports: [NotificationsService, FakeNotificationChannel],
})
export class NotificationsModule {}

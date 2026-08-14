import { Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Repository } from 'typeorm';
import { Notification } from '../database/entities/notification.entity';
import { User } from '../database/entities/user.entity';
import { WhatsAppAccount } from '../database/entities/whatsapp-account.entity';
import { NotificationStatus } from './entities/notification-status.enum';
import { NotificationChannelType } from './entities/notification-channel-type.enum';
import {
  EMAIL_CHANNEL,
  NotificationChannel,
  SMS_CHANNEL,
  WHATSAPP_CHANNEL,
} from './channels/notification-channel.interface';
import { NOTIFICATION_QUEUE, NotificationDeliveryJobData } from './notification-queue.constants';
import { NotificationsGateway } from './notifications.gateway';
import { toNotificationResponse } from './dto/notification-response';

const POSTGRES_UNIQUE_VIOLATION = '23505';

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === POSTGRES_UNIQUE_VIOLATION;
}

@Processor(NOTIFICATION_QUEUE)
export class NotificationDeliveryProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationDeliveryProcessor.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notifications: Repository<Notification>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(WhatsAppAccount)
    private readonly whatsappAccounts: Repository<WhatsAppAccount>,
    @Inject(EMAIL_CHANNEL)
    private readonly emailChannel: NotificationChannel,
    @Inject(SMS_CHANNEL)
    private readonly smsChannel: NotificationChannel,
    @Inject(WHATSAPP_CHANNEL)
    private readonly whatsappChannel: NotificationChannel,
    private readonly notificationsGateway: NotificationsGateway,
  ) {
    super();
  }

  async process(job: Job<NotificationDeliveryJobData>): Promise<void> {
    const { dedupeKey, userId, escrowId, eventType, channel } = job.data;

    let record = await this.notifications.findOne({ where: { dedupeKey } });
    if (record?.status === NotificationStatus.SENT) {
      return;
    }

    if (!record) {
      try {
        record = await this.notifications.save(
          this.notifications.create({
            dedupeKey,
            userId,
            escrowId,
            eventType,
            channel,
            status: NotificationStatus.PENDING,
          }),
        );
        if (channel === NotificationChannelType.EMAIL) {
          this.notificationsGateway.emitNotification(userId, toNotificationResponse(record));
        }
      } catch (error) {
        if (!isUniqueViolation(error)) {
          throw error;
        }
        record = await this.notifications.findOne({ where: { dedupeKey } });
        if (!record || record.status === NotificationStatus.SENT) {
          return;
        }
      }
    }

    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) {
      record.status = NotificationStatus.FAILED;
      await this.notifications.save(record);
      return;
    }

    const deliveryChannel =
      channel === NotificationChannelType.EMAIL
        ? this.emailChannel
        : channel === NotificationChannelType.SMS
          ? this.smsChannel
          : this.whatsappChannel;

    const whatsappAccount =
      channel === NotificationChannelType.WHATSAPP
        ? await this.whatsappAccounts.findOne({ where: { userId } })
        : null;

    try {
      await deliveryChannel.send({
        userId,
        escrowId,
        eventType,
        channel,
        recipientEmail: user.email,
        recipientPhone: user.phone,
        recipientWhatsapp: whatsappAccount?.notificationsOptedOutAt ? null : (whatsappAccount?.phoneNumber ?? null),
      });
      record.status = NotificationStatus.SENT;
      record.sentAt = new Date();
      await this.notifications.save(record);
    } catch (error) {
      record.status = NotificationStatus.FAILED;
      await this.notifications.save(record);
      throw error;
    }
  }

  @OnWorkerEvent('error')
  onWorkerError(error: Error): void {
    this.logger.warn(`Notification worker error: ${error.message}`);
  }
}

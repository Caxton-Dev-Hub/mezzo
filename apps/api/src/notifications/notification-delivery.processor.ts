import { Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Repository } from 'typeorm';
import { Notification } from '../database/entities/notification.entity';
import { User } from '../database/entities/user.entity';
import { NotificationStatus } from './entities/notification-status.enum';
import { NotificationChannelType } from './entities/notification-channel-type.enum';
import {
  EMAIL_CHANNEL,
  NotificationChannel,
  SMS_CHANNEL,
} from './channels/notification-channel.interface';
import { NOTIFICATION_QUEUE, NotificationDeliveryJobData } from './notification-queue.constants';

const POSTGRES_UNIQUE_VIOLATION = '23505';

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === POSTGRES_UNIQUE_VIOLATION;
}

@Processor(NOTIFICATION_QUEUE)
export class NotificationDeliveryProcessor extends WorkerHost {
  constructor(
    @InjectRepository(Notification)
    private readonly notifications: Repository<Notification>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @Inject(EMAIL_CHANNEL)
    private readonly emailChannel: NotificationChannel,
    @Inject(SMS_CHANNEL)
    private readonly smsChannel: NotificationChannel,
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

    const deliveryChannel = channel === NotificationChannelType.EMAIL ? this.emailChannel : this.smsChannel;

    try {
      await deliveryChannel.send({
        userId,
        escrowId,
        eventType,
        channel,
        recipientEmail: user.email,
        recipientPhone: user.phone,
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
}

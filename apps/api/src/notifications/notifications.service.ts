import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { Queue } from 'bullmq';
import { Notification } from '../database/entities/notification.entity';
import { NotificationEventType } from './entities/notification-event-type.enum';
import { NotificationChannelType } from './entities/notification-channel-type.enum';
import {
  NOTIFICATION_DELIVERY_JOB,
  NOTIFICATION_QUEUE,
  notificationDedupeKey,
} from './notification-queue.constants';
import { NotificationResponse, toNotificationResponse } from './dto/notification-response';

export interface NotifyInput {
  escrowId: string;
  sourceEventId: string;
  eventType: NotificationEventType;
  recipientUserIds: readonly string[];
  correlationId?: string;
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notifications: Repository<Notification>,
    @InjectQueue(NOTIFICATION_QUEUE)
    private readonly queue: Queue,
    private readonly configService: ConfigService,
  ) {}

  async notify(input: NotifyInput): Promise<void> {
    const attempts = this.configService.getOrThrow<number>('NOTIFICATION_QUEUE_ATTEMPTS');
    const backoffMs = this.configService.getOrThrow<number>('NOTIFICATION_QUEUE_BACKOFF_MS');
    const uniqueRecipients = [...new Set(input.recipientUserIds)];

    for (const userId of uniqueRecipients) {
      for (const channel of [NotificationChannelType.EMAIL, NotificationChannelType.SMS]) {
        const dedupeKey = notificationDedupeKey(input.sourceEventId, channel, userId);
        await this.queue.add(
          NOTIFICATION_DELIVERY_JOB,
          {
            escrowId: input.escrowId,
            userId,
            channel,
            eventType: input.eventType,
            dedupeKey,
            correlationId: input.correlationId,
          },
          { jobId: dedupeKey, attempts, backoff: { type: 'exponential', delay: backoffMs } },
        );
      }
    }
  }

  async listForUser(userId: string): Promise<NotificationResponse[]> {
    const rows = await this.notifications.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    return rows.map(toNotificationResponse);
  }
}

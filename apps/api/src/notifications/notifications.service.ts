import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IsNull, Repository } from 'typeorm';
import { Queue } from 'bullmq';
import { Notification } from '../database/entities/notification.entity';
import { WhatsAppAccount } from '../database/entities/whatsapp-account.entity';
import { NotificationEventType } from './entities/notification-event-type.enum';
import { NotificationChannelType } from './entities/notification-channel-type.enum';
import {
  NOTIFICATION_DELIVERY_JOB,
  NOTIFICATION_QUEUE,
  notificationDedupeKey,
} from './notification-queue.constants';
import { NotificationResponse, toNotificationResponse } from './dto/notification-response';
import { NotificationNotFoundError } from './errors/notification-not-found.error';

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
    @InjectRepository(WhatsAppAccount)
    private readonly whatsappAccounts: Repository<WhatsAppAccount>,
    @InjectQueue(NOTIFICATION_QUEUE)
    private readonly queue: Queue,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async notify(input: NotifyInput): Promise<void> {
    const attempts = this.configService.getOrThrow<number>('NOTIFICATION_QUEUE_ATTEMPTS');
    const backoffMs = this.configService.getOrThrow<number>('NOTIFICATION_QUEUE_BACKOFF_MS');
    const uniqueRecipients = [...new Set(input.recipientUserIds)];

    this.eventEmitter.emit('escrow.updated', {
      escrowId: input.escrowId,
      eventType: input.eventType,
      occurredAt: new Date(),
    });

    for (const userId of uniqueRecipients) {
      const hasWhatsapp = await this.whatsappAccounts.exists({
        where: { userId, notificationsOptedOutAt: IsNull() },
      });
      const channels = hasWhatsapp
        ? [NotificationChannelType.EMAIL, NotificationChannelType.SMS, NotificationChannelType.WHATSAPP]
        : [NotificationChannelType.EMAIL, NotificationChannelType.SMS];

      for (const channel of channels) {
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

  async markRead(id: string, userId: string): Promise<NotificationResponse> {
    const notification = await this.notifications.findOne({ where: { id, userId } });
    if (!notification) {
      throw new NotificationNotFoundError();
    }

    if (!notification.isRead) {
      notification.isRead = true;
      notification.readAt = new Date();
      await this.notifications.save(notification);
    }

    return toNotificationResponse(notification);
  }

  async markAllRead(userId: string): Promise<void> {
    await this.notifications.update({ userId, isRead: false }, { isRead: true, readAt: new Date() });
  }
}

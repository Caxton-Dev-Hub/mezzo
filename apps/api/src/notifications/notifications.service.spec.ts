import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import { Queue } from 'bullmq';
import { NotificationsService } from './notifications.service';
import { NotificationChannelType } from './entities/notification-channel-type.enum';
import { NotificationEventType } from './entities/notification-event-type.enum';
import { NotificationNotFoundError } from './errors/notification-not-found.error';
import { notificationDedupeKey } from './notification-queue.constants';
import { Notification } from '../database/entities/notification.entity';
import { WhatsAppAccount } from '../database/entities/whatsapp-account.entity';
import { callArg, callArgs } from '../../test/support/mock-calls';

const ESCROW_ID = 'escrow-1';
const USER_ID = 'user-1';
const OTHER_USER_ID = 'user-2';
const ATTEMPTS = 5;
const BACKOFF_MS = 1_000;

function buildNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'notification-1',
    userId: USER_ID,
    escrowId: ESCROW_ID,
    eventType: NotificationEventType.FUNDED,
    channel: NotificationChannelType.EMAIL,
    isRead: false,
    readAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  } as Notification;
}

interface Harness {
  service: NotificationsService;
  queueAdd: jest.Mock;
  emit: jest.Mock;
  find: jest.Mock;
  findOne: jest.Mock;
  save: jest.Mock;
  update: jest.Mock;
}

function buildHarness(
  options: {
    rows?: Notification[];
    row?: Notification | null;
    hasWhatsapp?: boolean;
  } = {},
): Harness {
  const find = jest.fn().mockResolvedValue(options.rows ?? []);
  const findOne = jest
    .fn()
    .mockResolvedValue(options.row === undefined ? buildNotification() : options.row);
  const save = jest.fn().mockImplementation((row) => Promise.resolve(row));
  const update = jest.fn().mockResolvedValue({ affected: 1 });
  const notifications = {
    find,
    findOne,
    save,
    update,
  } as unknown as Repository<Notification>;

  const whatsappAccounts = {
    exists: jest.fn().mockResolvedValue(options.hasWhatsapp ?? false),
  } as unknown as Repository<WhatsAppAccount>;

  const queueAdd = jest.fn().mockResolvedValue(undefined);
  const queue = { add: queueAdd } as unknown as Queue;

  const configService = {
    getOrThrow: jest.fn().mockImplementation((key: string) => {
      if (key === 'NOTIFICATION_QUEUE_ATTEMPTS') {
        return ATTEMPTS;
      }
      if (key === 'NOTIFICATION_QUEUE_BACKOFF_MS') {
        return BACKOFF_MS;
      }
      throw new Error(`Unexpected config key ${key}`);
    }),
  } as unknown as ConfigService;

  const emit = jest.fn();
  const eventEmitter = { emit } as unknown as EventEmitter2;

  return {
    service: new NotificationsService(
      notifications,
      whatsappAccounts,
      queue,
      configService,
      eventEmitter,
    ),
    queueAdd,
    emit,
    find,
    findOne,
    save,
    update,
  };
}

const notifyInput = {
  escrowId: ESCROW_ID,
  sourceEventId: 'escrow-1_FUNDED_3',
  eventType: NotificationEventType.FUNDED,
  recipientUserIds: [USER_ID],
};

describe('NotificationsService.notify', () => {
  it('queues one job per channel for each recipient', async () => {
    const harness = buildHarness();

    await harness.service.notify({
      ...notifyInput,
      recipientUserIds: [USER_ID, OTHER_USER_ID],
    });

    expect(harness.queueAdd).toHaveBeenCalledTimes(4);
  });

  it('sends over both email and sms', async () => {
    const harness = buildHarness();

    await harness.service.notify(notifyInput);

    const channels = callArgs(harness.queueAdd).map(
      (call) => (call[1] as { channel: NotificationChannelType }).channel,
    );
    expect(channels).toEqual([NotificationChannelType.EMAIL, NotificationChannelType.SMS]);
  });

  it('collapses a duplicated recipient so nobody is told twice', async () => {
    const harness = buildHarness();

    await harness.service.notify({ ...notifyInput, recipientUserIds: [USER_ID, USER_ID] });

    expect(harness.queueAdd).toHaveBeenCalledTimes(2);
  });

  it('keys each job so a replayed source event cannot double-send', async () => {
    const harness = buildHarness();

    await harness.service.notify(notifyInput);

    expect(callArg<{ jobId: string }>(harness.queueAdd, 0, 2).jobId).toBe(
      notificationDedupeKey('escrow-1_FUNDED_3', NotificationChannelType.EMAIL, USER_ID),
    );
  });

  it('applies the configured retry budget and exponential backoff', async () => {
    const harness = buildHarness();

    await harness.service.notify(notifyInput);

    expect(callArg(harness.queueAdd, 0, 2)).toEqual(
      expect.objectContaining({
        attempts: ATTEMPTS,
        backoff: { type: 'exponential', delay: BACKOFF_MS },
      }),
    );
  });

  it('emits a live escrow update alongside the queued delivery', async () => {
    const harness = buildHarness();

    await harness.service.notify(notifyInput);

    expect(harness.emit).toHaveBeenCalledWith(
      'escrow.updated',
      expect.objectContaining({
        escrowId: ESCROW_ID,
        eventType: NotificationEventType.FUNDED,
      }),
    );
  });

  it('emits the live update even when there are no recipients', async () => {
    const harness = buildHarness();

    await harness.service.notify({ ...notifyInput, recipientUserIds: [] });

    expect(harness.emit).toHaveBeenCalledTimes(1);
    expect(harness.queueAdd).not.toHaveBeenCalled();
  });

  it('adds a whatsapp job when the recipient has a linked, opted-in account', async () => {
    const harness = buildHarness({ hasWhatsapp: true });

    await harness.service.notify(notifyInput);

    const channels = callArgs(harness.queueAdd).map(
      (call) => (call[1] as { channel: NotificationChannelType }).channel,
    );
    expect(channels).toEqual([
      NotificationChannelType.EMAIL,
      NotificationChannelType.SMS,
      NotificationChannelType.WHATSAPP,
    ]);
  });

  it('carries the correlation id onto every queued job', async () => {
    const harness = buildHarness();

    await harness.service.notify({ ...notifyInput, correlationId: 'corr-4' });

    expect(
      callArgs(harness.queueAdd).every(
        (call) => (call[1] as { correlationId?: string }).correlationId === 'corr-4',
      ),
    ).toBe(true);
  });
});

describe('NotificationsService.listForUser', () => {
  it('returns the user notifications newest first', async () => {
    const harness = buildHarness({ rows: [buildNotification()] });

    const rows = await harness.service.listForUser(USER_ID);

    expect(harness.find).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      order: { createdAt: 'DESC' },
    });
    expect(rows).toHaveLength(1);
  });
});

describe('NotificationsService.markRead', () => {
  it('throws when the notification does not belong to the caller', async () => {
    const harness = buildHarness({ row: null });

    await expect(harness.service.markRead('notification-1', USER_ID)).rejects.toBeInstanceOf(
      NotificationNotFoundError,
    );
  });

  it('scopes the lookup to the calling user', async () => {
    const harness = buildHarness();

    await harness.service.markRead('notification-1', USER_ID);

    expect(harness.findOne).toHaveBeenCalledWith({
      where: { id: 'notification-1', userId: USER_ID },
    });
  });

  it('marks an unread notification read and stamps the time', async () => {
    const row = buildNotification();
    const harness = buildHarness({ row });

    const response = await harness.service.markRead('notification-1', USER_ID);

    expect(row.isRead).toBe(true);
    expect(row.readAt).toBeInstanceOf(Date);
    expect(response.isRead).toBe(true);
  });

  it('leaves an already-read notification untouched', async () => {
    const readAt = new Date('2026-01-05T00:00:00.000Z');
    const row = buildNotification({ isRead: true, readAt });
    const harness = buildHarness({ row });

    await harness.service.markRead('notification-1', USER_ID);

    expect(harness.save).not.toHaveBeenCalled();
    expect(row.readAt).toBe(readAt);
  });
});

describe('NotificationsService.markAllRead', () => {
  it('touches only the unread notifications of that user', async () => {
    const harness = buildHarness();

    await harness.service.markAllRead(USER_ID);

    expect(harness.update).toHaveBeenCalledWith(
      { userId: USER_ID, isRead: false },
      { isRead: true, readAt: expect.any(Date) as Date },
    );
  });
});

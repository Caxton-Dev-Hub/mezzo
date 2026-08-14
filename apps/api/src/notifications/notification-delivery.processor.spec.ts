import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import { NotificationDeliveryProcessor } from './notification-delivery.processor';
import { NotificationStatus } from './entities/notification-status.enum';
import { NotificationChannelType } from './entities/notification-channel-type.enum';
import { NotificationEventType } from './entities/notification-event-type.enum';
import { NotificationChannel } from './channels/notification-channel.interface';
import { NotificationDeliveryJobData } from './notification-queue.constants';
import { NotificationsGateway } from './notifications.gateway';
import { Notification } from '../database/entities/notification.entity';
import { User } from '../database/entities/user.entity';
import { WhatsAppAccount } from '../database/entities/whatsapp-account.entity';

const USER_ID = 'user-1';
const ESCROW_ID = 'escrow-1';
const DEDUPE_KEY = 'escrow-1_FUNDED_3:EMAIL:user-1';

function buildJob(
  overrides: Partial<NotificationDeliveryJobData> = {},
): Job<NotificationDeliveryJobData> {
  return {
    data: {
      escrowId: ESCROW_ID,
      userId: USER_ID,
      channel: NotificationChannelType.EMAIL,
      eventType: NotificationEventType.FUNDED,
      dedupeKey: DEDUPE_KEY,
      ...overrides,
    },
  } as Job<NotificationDeliveryJobData>;
}

function buildRecord(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'notification-1',
    dedupeKey: DEDUPE_KEY,
    userId: USER_ID,
    escrowId: ESCROW_ID,
    eventType: NotificationEventType.FUNDED,
    channel: NotificationChannelType.EMAIL,
    status: NotificationStatus.PENDING,
    sentAt: null,
    isRead: false,
    readAt: null,
    createdAt: new Date(),
    ...overrides,
  } as Notification;
}

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: USER_ID,
    email: 'user@example.com',
    phone: '+2348000000000',
    ...overrides,
  } as User;
}

interface Harness {
  processor: NotificationDeliveryProcessor;
  findOne: jest.Mock;
  save: jest.Mock;
  usersFindOne: jest.Mock;
  emailSend: jest.Mock;
  smsSend: jest.Mock;
  whatsappSend: jest.Mock;
  emitNotification: jest.Mock;
}

function buildHarness(
  options: { existing?: Notification | null; user?: User | null } = {},
): Harness {
  const findOne = jest
    .fn()
    .mockResolvedValue(options.existing === undefined ? null : options.existing);
  const save = jest.fn().mockImplementation((row) => Promise.resolve({ id: 'notification-1', ...row }));
  const notifications = {
    findOne,
    save,
    create: (row: Partial<Notification>) => row,
  } as unknown as Repository<Notification>;

  const usersFindOne = jest
    .fn()
    .mockResolvedValue(options.user === undefined ? buildUser() : options.user);
  const users = { findOne: usersFindOne } as unknown as Repository<User>;
  const whatsappAccounts = {
    findOne: jest.fn().mockResolvedValue(null),
  } as unknown as Repository<WhatsAppAccount>;

  const emailSend = jest.fn().mockResolvedValue(undefined);
  const emailChannel = { send: emailSend } as unknown as NotificationChannel;
  const smsSend = jest.fn().mockResolvedValue(undefined);
  const smsChannel = { send: smsSend } as unknown as NotificationChannel;
  const whatsappSend = jest.fn().mockResolvedValue(undefined);
  const whatsappChannel = { send: whatsappSend } as unknown as NotificationChannel;

  const emitNotification = jest.fn();
  const gateway = { emitNotification } as unknown as NotificationsGateway;

  return {
    processor: new NotificationDeliveryProcessor(
      notifications,
      users,
      whatsappAccounts,
      emailChannel,
      smsChannel,
      whatsappChannel,
      gateway,
    ),
    findOne,
    save,
    usersFindOne,
    emailSend,
    smsSend,
    whatsappSend,
    emitNotification,
  };
}

describe('NotificationDeliveryProcessor.process', () => {
  it('does nothing when the notification was already sent', async () => {
    const harness = buildHarness({ existing: buildRecord({ status: NotificationStatus.SENT }) });

    await harness.processor.process(buildJob());

    expect(harness.emailSend).not.toHaveBeenCalled();
    expect(harness.save).not.toHaveBeenCalled();
  });

  it('creates a pending record for a first delivery attempt', async () => {
    const harness = buildHarness();

    await harness.processor.process(buildJob());

    expect(harness.save).toHaveBeenCalledWith(
      expect.objectContaining({
        dedupeKey: DEDUPE_KEY,
        userId: USER_ID,
        status: NotificationStatus.PENDING,
      }),
    );
  });

  it('pushes the new notification to the connected client on the email pass only', async () => {
    const harness = buildHarness();

    await harness.processor.process(buildJob());

    expect(harness.emitNotification).toHaveBeenCalledWith(USER_ID, expect.objectContaining({ id: 'notification-1' }));
  });

  it('does not push a second time on the sms pass', async () => {
    const harness = buildHarness();

    await harness.processor.process(buildJob({ channel: NotificationChannelType.SMS }));

    expect(harness.emitNotification).not.toHaveBeenCalled();
  });

  it('recovers from a concurrent insert by reloading the row', async () => {
    const harness = buildHarness();
    const uniqueViolation = Object.assign(new Error('duplicate key'), { code: '23505' });
    harness.save.mockRejectedValueOnce(uniqueViolation);
    harness.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(buildRecord());

    await harness.processor.process(buildJob());

    expect(harness.emailSend).toHaveBeenCalledTimes(1);
  });

  it('gives up quietly when the concurrent insert already sent the message', async () => {
    const harness = buildHarness();
    const uniqueViolation = Object.assign(new Error('duplicate key'), { code: '23505' });
    harness.save.mockRejectedValueOnce(uniqueViolation);
    harness.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(buildRecord({ status: NotificationStatus.SENT }));

    await harness.processor.process(buildJob());

    expect(harness.emailSend).not.toHaveBeenCalled();
  });

  it('rethrows a database failure that is not a duplicate key', async () => {
    const harness = buildHarness();
    harness.save.mockRejectedValueOnce(new Error('connection lost'));

    await expect(harness.processor.process(buildJob())).rejects.toThrow('connection lost');
  });

  it('fails the notification without retrying when the recipient no longer exists', async () => {
    const harness = buildHarness({ existing: buildRecord(), user: null });

    await harness.processor.process(buildJob());

    expect(harness.emailSend).not.toHaveBeenCalled();
    expect(harness.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: NotificationStatus.FAILED }),
    );
  });

  it('delivers over email with the recipient contact details', async () => {
    const harness = buildHarness({ existing: buildRecord() });

    await harness.processor.process(buildJob());

    expect(harness.emailSend).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        escrowId: ESCROW_ID,
        eventType: NotificationEventType.FUNDED,
        recipientEmail: 'user@example.com',
        recipientPhone: '+2348000000000',
      }),
    );
    expect(harness.smsSend).not.toHaveBeenCalled();
  });

  it('routes an sms job to the sms channel', async () => {
    const harness = buildHarness({
      existing: buildRecord({ channel: NotificationChannelType.SMS }),
    });

    await harness.processor.process(buildJob({ channel: NotificationChannelType.SMS }));

    expect(harness.smsSend).toHaveBeenCalledTimes(1);
    expect(harness.emailSend).not.toHaveBeenCalled();
  });

  it('marks the notification sent and stamps the time on success', async () => {
    const record = buildRecord();
    const harness = buildHarness({ existing: record });

    await harness.processor.process(buildJob());

    expect(record.status).toBe(NotificationStatus.SENT);
    expect(record.sentAt).toBeInstanceOf(Date);
  });

  it('marks the notification failed and rethrows so the job retries', async () => {
    const record = buildRecord();
    const harness = buildHarness({ existing: record });
    harness.emailSend.mockRejectedValue(new Error('provider down'));

    await expect(harness.processor.process(buildJob())).rejects.toThrow('provider down');
    expect(record.status).toBe(NotificationStatus.FAILED);
  });
});

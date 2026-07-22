import type { Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { Repository } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { EscrowRole } from '../../src/escrow/entities/escrow-role.enum';
import { EvidencePhase } from '../../src/evidence/entities/evidence-phase.enum';
import { Notification } from '../../src/database/entities/notification.entity';
import { NotificationEventType } from '../../src/notifications/entities/notification-event-type.enum';
import { NotificationChannelType } from '../../src/notifications/entities/notification-channel-type.enum';
import { NotificationStatus } from '../../src/notifications/entities/notification-status.enum';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { FakeNotificationChannel } from '../../src/notifications/channels/fake-notification.channel';
import { RedisService } from '../../src/redis/redis.service';

interface AuthTokensBody {
  accessToken: string;
  user: { id: string };
}

interface EscrowDetailBody {
  id: string;
}

interface PresignBody {
  uploadUrl: string;
  key: string;
}

const fixturesDir = join(__dirname, '..', 'fixtures', 'evidence');

function readFixture(name: string): Buffer {
  return readFileSync(join(fixturesDir, name));
}

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 5000, intervalMs = 50): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error('waitFor: condition not met before timeout');
}

describe('Notifications (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let redis: RedisService;
  let notifications: Repository<Notification>;
  let notificationsService: NotificationsService;
  let fakeChannel: FakeNotificationChannel;
  let userCounter = 0;

  const password = 'super-secret-password';

  function uniqueEmail(): string {
    userCounter += 1;
    return `notif-user-${Date.now()}-${userCounter}@example.com`;
  }

  function auth(token: string): { Authorization: string } {
    return { Authorization: `Bearer ${token}` };
  }

  async function registerAndLogin(): Promise<{ userId: string; accessToken: string }> {
    const email = uniqueEmail();
    await request(server).post('/auth/register').send({ email, password });
    const loginResponse = await request(server).post('/auth/login').send({ email, password });
    const body = loginResponse.body as AuthTokensBody;
    return { userId: body.user.id, accessToken: body.accessToken };
  }

  async function agreeEscrow(): Promise<{
    escrowId: string;
    buyer: { userId: string; accessToken: string };
    seller: { userId: string; accessToken: string };
  }> {
    const buyer = await registerAndLogin();
    const seller = await registerAndLogin();

    const draftResponse = await request(server)
      .post('/escrows')
      .set(auth(buyer.accessToken))
      .send({
        inspectionWindowHours: 48,
        deliveryMethod: 'courier',
        itemDescription: 'A vintage camera',
        feeBps: 250,
        price: { amount: 100_000, currency: 'NGN' },
        role: EscrowRole.BUYER,
      });
    const draft = draftResponse.body as EscrowDetailBody;

    const presignResponse = await request(server)
      .post('/evidence/presign')
      .set(auth(buyer.accessToken))
      .send({ escrowId: draft.id, phase: EvidencePhase.AT_CREATION, mimeType: 'image/jpeg' });
    const presign = presignResponse.body as PresignBody;
    await fetch(presign.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      body: readFixture('with-exif.jpg'),
    });
    await request(server)
      .post('/evidence/confirm')
      .set(auth(buyer.accessToken))
      .send({
        escrowId: draft.id,
        phase: EvidencePhase.AT_CREATION,
        key: presign.key,
        declaredMime: 'image/jpeg',
      });

    const inviteResponse = await request(server)
      .post(`/escrows/${draft.id}/invite`)
      .set(auth(buyer.accessToken));
    const invite = inviteResponse.body as { token: string };

    await request(server).post(`/invites/${invite.token}/accept`).set(auth(seller.accessToken));
    await request(server).post(`/escrows/${draft.id}/accept-terms`).set(auth(buyer.accessToken));
    await request(server).post(`/escrows/${draft.id}/accept-terms`).set(auth(seller.accessToken));

    return { escrowId: draft.id, buyer, seller };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    await app.init();
    server = app.getHttpServer() as Server;
    redis = app.get(RedisService);
    notifications = app.get<Repository<Notification>>(getRepositoryToken(Notification));
    notificationsService = app.get(NotificationsService);
    fakeChannel = app.get(FakeNotificationChannel);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await redis.flushdb();
  });

  it('delivers exactly one notification per channel per recipient for a state transition', async () => {
    const { escrowId, buyer, seller } = await agreeEscrow();

    await waitFor(async () => {
      const count = await notifications.count({
        where: { escrowId, eventType: NotificationEventType.AGREED },
      });
      return count === 4;
    });

    const rows = await notifications.find({
      where: { escrowId, eventType: NotificationEventType.AGREED },
    });
    expect(rows).toHaveLength(4);

    for (const userId of [buyer.userId, seller.userId]) {
      for (const channel of [NotificationChannelType.EMAIL, NotificationChannelType.SMS]) {
        const match = rows.filter((row) => row.userId === userId && row.channel === channel);
        expect(match).toHaveLength(1);
      }
    }

    await waitFor(async () => {
      const sentCount = await notifications.count({
        where: { escrowId, eventType: NotificationEventType.AGREED, status: NotificationStatus.SENT },
      });
      return sentCount === 4;
    });
  });

  it('does not duplicate delivery when the same source event is notified twice', async () => {
    const { escrowId, buyer } = await agreeEscrow();
    fakeChannel.sent.length = 0;

    const notifyInput = {
      escrowId,
      sourceEventId: `test-dedupe-${escrowId}`,
      eventType: NotificationEventType.SHIPPED,
      recipientUserIds: [buyer.userId],
    };

    await notificationsService.notify(notifyInput);
    await waitFor(async () => {
      const count = await notifications.count({
        where: { escrowId, eventType: NotificationEventType.SHIPPED, userId: buyer.userId },
      });
      return count === 2;
    });

    await notificationsService.notify(notifyInput);
    await new Promise((resolve) => setTimeout(resolve, 500));

    const rows = await notifications.find({
      where: { escrowId, eventType: NotificationEventType.SHIPPED, userId: buyer.userId },
    });
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.status === NotificationStatus.SENT)).toBe(true);

    const deliveredForBuyer = fakeChannel.sent.filter(
      (delivery) => delivery.userId === buyer.userId && delivery.eventType === NotificationEventType.SHIPPED,
    );
    expect(deliveredForBuyer).toHaveLength(2);
  });

  it('exposes the recipient their own notifications via the API', async () => {
    const { buyer } = await agreeEscrow();

    await waitFor(async () => {
      const count = await notifications.count({ where: { userId: buyer.userId } });
      return count > 0;
    });

    const response = await request(server).get('/notifications').set(auth(buyer.accessToken));
    expect(response.status).toBe(200);
    const body = response.body as { eventType: NotificationEventType }[];
    expect(body.length).toBeGreaterThan(0);
  });
});

import { Injectable } from '@nestjs/common';
import { NotificationChannel, NotificationDeliveryRequest } from './notification-channel.interface';

@Injectable()
export class FakeNotificationChannel implements NotificationChannel {
  readonly name = 'FAKE';
  readonly sent: NotificationDeliveryRequest[] = [];

  send(request: NotificationDeliveryRequest): Promise<void> {
    this.sent.push(request);
    return Promise.resolve();
  }
}

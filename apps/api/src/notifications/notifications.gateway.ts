import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { SocketRejection } from '@mezzo/shared-types';
import { NotificationResponse } from './dto/notification-response';

interface AccessTokenPayload {
  sub: string;
}

export function notificationRoomName(userId: string): string {
  return `user:${userId}`;
}

@WebSocketGateway({ namespace: '/ws/notifications', cors: { origin: true, credentials: true } })
export class NotificationsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  afterInit(server: Server): void {
    server.use((client, next) => {
      void this.authenticate(client).then(
        () => next(),
        (error: Error) => next(error),
      );
    });
  }

  async handleConnection(client: Socket): Promise<void> {
    const { userId } = client.data as { userId: string };
    await client.join(notificationRoomName(userId));
  }

  handleDisconnect(): void {}

  emitNotification(userId: string, notification: NotificationResponse): void {
    this.server.to(notificationRoomName(userId)).emit('notification:new', notification);
  }

  private async authenticate(client: Socket): Promise<void> {
    const token = this.extractToken(client);
    if (!token) {
      throw this.rejection('Missing token');
    }

    try {
      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token, {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
      client.data = { userId: payload.sub };
    } catch (error) {
      throw this.rejection((error as Error).message);
    }
  }

  private rejection(reason: string): Error {
    this.logger.debug(`Rejecting websocket connection (UNAUTHORIZED): ${reason}`);
    return Object.assign(new Error('UNAUTHORIZED'), {
      data: { code: 'UNAUTHORIZED' } satisfies SocketRejection,
    });
  }

  private extractToken(client: Socket): string | undefined {
    const auth = client.handshake.auth as Record<string, unknown>;
    if (typeof auth.token === 'string') {
      return auth.token;
    }
    const query = client.handshake.query.token;
    return typeof query === 'string' ? query : undefined;
  }
}

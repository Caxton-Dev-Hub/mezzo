import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { NotificationResponse } from './dto/notification-response';

interface AccessTokenPayload {
  sub: string;
}

export function notificationRoomName(userId: string): string {
  return `user:${userId}`;
}

@WebSocketGateway({ namespace: '/ws/notifications', cors: { origin: true, credentials: true } })
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = this.extractToken(client);
      if (!token) {
        client.disconnect(true);
        return;
      }

      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token, {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });

      await client.join(notificationRoomName(payload.sub));
    } catch (error) {
      this.logger.debug(`Rejecting websocket connection: ${(error as Error).message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(): void {}

  emitNotification(userId: string, notification: NotificationResponse): void {
    this.server.to(notificationRoomName(userId)).emit('notification:new', notification);
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

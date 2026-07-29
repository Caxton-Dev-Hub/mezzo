import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { UserRole } from '../users/entities/user-role.enum';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { ChatService } from './chat.service';
import { sendMessageSchema } from './dto/chat.schemas';
import { chatRoomName } from './chat-room';
import { EscrowUpdatedEvent } from './events/escrow-updated.event';

interface AccessTokenPayload {
  sub: string;
  role: UserRole;
}

interface SocketData {
  user: AuthenticatedUser;
  escrowId: string;
}

@WebSocketGateway({ namespace: '/ws/chat', cors: { origin: true, credentials: true } })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly chatService: ChatService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = this.extractToken(client);
      const escrowId = this.extractEscrowId(client);
      if (!token || !escrowId) {
        client.disconnect(true);
        return;
      }

      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token, {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
      const user: AuthenticatedUser = { id: payload.sub, role: payload.role };

      await this.chatService.assertCanAccess(escrowId, user);

      const data: SocketData = { user, escrowId };
      client.data = data;
      await client.join(chatRoomName(escrowId));
    } catch (error) {
      this.logger.debug(`Rejecting websocket connection: ${(error as Error).message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(): void {}

  @SubscribeMessage('message:send')
  async onMessageSend(@ConnectedSocket() client: Socket, @MessageBody() body: unknown): Promise<void> {
    const data = client.data as Partial<SocketData>;
    if (!data.user || !data.escrowId) {
      client.disconnect(true);
      return;
    }

    const result = sendMessageSchema.safeParse(body);
    if (!result.success) {
      client.emit('message:error', { message: 'Invalid message payload' });
      return;
    }

    const message = await this.chatService.send(data.escrowId, data.user, result.data);
    this.server.to(chatRoomName(data.escrowId)).emit('message:new', message);
  }

  @SubscribeMessage('message:read')
  async onMessageRead(@ConnectedSocket() client: Socket): Promise<void> {
    const data = client.data as Partial<SocketData>;
    if (!data.user || !data.escrowId) {
      client.disconnect(true);
      return;
    }

    const readState = await this.chatService.markRead(data.escrowId, data.user);
    client.to(chatRoomName(data.escrowId)).emit('message:read', readState);
  }

  @OnEvent('escrow.updated')
  onEscrowUpdated(event: EscrowUpdatedEvent): void {
    this.server.to(chatRoomName(event.escrowId)).emit('escrow:updated', event);
  }

  private extractToken(client: Socket): string | undefined {
    const auth = client.handshake.auth as Record<string, unknown>;
    if (typeof auth.token === 'string') {
      return auth.token;
    }
    const query = client.handshake.query.token;
    return typeof query === 'string' ? query : undefined;
  }

  private extractEscrowId(client: Socket): string | undefined {
    const auth = client.handshake.auth as Record<string, unknown>;
    if (typeof auth.escrowId === 'string') {
      return auth.escrowId;
    }
    const query = client.handshake.query.escrowId;
    return typeof query === 'string' ? query : undefined;
  }
}

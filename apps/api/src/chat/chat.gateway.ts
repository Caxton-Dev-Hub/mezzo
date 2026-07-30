import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { SocketRejection } from '@mezzo/shared-types';
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
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly chatService: ChatService,
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
    const { escrowId } = client.data as SocketData;
    await client.join(chatRoomName(escrowId));
  }

  handleDisconnect(): void {}

  @SubscribeMessage('message:send')
  async onMessageSend(@ConnectedSocket() client: Socket, @MessageBody() body: unknown): Promise<void> {
    const data = client.data as SocketData;

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
    const data = client.data as SocketData;

    const readState = await this.chatService.markRead(data.escrowId, data.user);
    client.to(chatRoomName(data.escrowId)).emit('message:read', readState);
  }

  @OnEvent('escrow.updated')
  onEscrowUpdated(event: EscrowUpdatedEvent): void {
    this.server.to(chatRoomName(event.escrowId)).emit('escrow:updated', event);
  }

  private async authenticate(client: Socket): Promise<void> {
    const token = this.extractToken(client);
    const escrowId = this.extractEscrowId(client);
    if (!token || !escrowId) {
      throw this.rejection('UNAUTHORIZED', 'Missing token or escrow id');
    }

    let user: AuthenticatedUser;
    try {
      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token, {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
      user = { id: payload.sub, role: payload.role };
    } catch (error) {
      throw this.rejection('UNAUTHORIZED', (error as Error).message);
    }

    try {
      await this.chatService.assertCanAccess(escrowId, user);
    } catch (error) {
      throw this.rejection('FORBIDDEN', (error as Error).message);
    }

    client.data = { user, escrowId } satisfies SocketData;
  }

  private rejection(code: SocketRejection['code'], reason: string): Error {
    this.logger.debug(`Rejecting websocket connection (${code}): ${reason}`);
    return Object.assign(new Error(code), { data: { code } satisfies SocketRejection });
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

import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Server, Socket } from 'socket.io';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { chatRoomName } from './chat-room';
import { NotEscrowPartyError } from '../escrow/errors/not-escrow-party.error';
import { UserRole } from '../users/entities/user-role.enum';
import { callArg } from '../../test/support/mock-calls';

const ESCROW_ID = 'escrow-1';
const USER_ID = 'user-1';

interface SocketLike {
  handshake: { auth: Record<string, unknown>; query: Record<string, unknown> };
  data: unknown;
  join: jest.Mock;
  emit: jest.Mock;
  to: jest.Mock;
}

function buildClient(
  auth: Record<string, unknown> = { token: 'good', escrowId: ESCROW_ID },
  query: Record<string, unknown> = {},
): SocketLike {
  const emit = jest.fn();
  return {
    handshake: { auth, query },
    data: {},
    join: jest.fn().mockResolvedValue(undefined),
    emit,
    to: jest.fn().mockReturnValue({ emit }),
  };
}

interface Harness {
  gateway: ChatGateway;
  verifyAsync: jest.Mock;
  assertCanAccess: jest.Mock;
  send: jest.Mock;
  markRead: jest.Mock;
  serverEmit: jest.Mock;
  serverTo: jest.Mock;
  use: jest.Mock;
}

function buildHarness(): Harness {
  const verifyAsync = jest.fn().mockResolvedValue({ sub: USER_ID, role: UserRole.USER });
  const jwtService = { verifyAsync } as unknown as JwtService;

  const configService = {
    getOrThrow: jest.fn().mockReturnValue('access-secret'),
  } as unknown as ConfigService;

  const assertCanAccess = jest.fn().mockResolvedValue(undefined);
  const send = jest.fn().mockResolvedValue({ id: 'message-1', body: 'hi' });
  const markRead = jest.fn().mockResolvedValue({ userId: USER_ID, lastReadAt: new Date() });
  const chatService = { assertCanAccess, send, markRead } as unknown as ChatService;

  const gateway = new ChatGateway(jwtService, configService, chatService);

  const serverEmit = jest.fn();
  const serverTo = jest.fn().mockReturnValue({ emit: serverEmit });
  const use = jest.fn();
  gateway.server = { to: serverTo, use } as unknown as Server;

  return { gateway, verifyAsync, assertCanAccess, send, markRead, serverEmit, serverTo, use };
}

type SocketMiddleware = (client: unknown, next: (error?: Error) => void) => void;

function authenticate(harness: Harness, client: SocketLike): Promise<void> {
  harness.gateway.afterInit(harness.gateway.server);
  const middleware = callArg<SocketMiddleware>(harness.use, 0, 0);

  return new Promise((resolve, reject) => {
    middleware(client, (error?: Error) => (error ? reject(error) : resolve()));
  });
}

describe('ChatGateway connection authentication', () => {
  it('rejects a handshake with no token', async () => {
    const harness = buildHarness();

    await expect(authenticate(harness, buildClient({ escrowId: ESCROW_ID }))).rejects.toThrow(
      'UNAUTHORIZED',
    );
  });

  it('rejects a handshake with no escrow id', async () => {
    const harness = buildHarness();

    await expect(authenticate(harness, buildClient({ token: 'good' }))).rejects.toThrow(
      'UNAUTHORIZED',
    );
  });

  it('rejects an invalid token', async () => {
    const harness = buildHarness();
    harness.verifyAsync.mockRejectedValue(new Error('jwt expired'));

    await expect(authenticate(harness, buildClient())).rejects.toThrow('UNAUTHORIZED');
  });

  it('rejects a user who may not read this escrow chat, with a distinct code', async () => {
    const harness = buildHarness();
    harness.assertCanAccess.mockRejectedValue(new NotEscrowPartyError());

    const error = (await authenticate(harness, buildClient()).catch(
      (caught: Error) => caught,
    )) as Error & { data: { code: string } };

    expect(error.message).toBe('FORBIDDEN');
    expect(error.data).toEqual({ code: 'FORBIDDEN' });
  });

  it('accepts a valid handshake and stores the identity on the socket', async () => {
    const harness = buildHarness();
    const client = buildClient();

    await authenticate(harness, client);

    expect(client.data).toEqual({
      user: { id: USER_ID, role: UserRole.USER },
      escrowId: ESCROW_ID,
    });
  });

  it('accepts the token and escrow id from the query string too', async () => {
    const harness = buildHarness();
    const client = buildClient({}, { token: 'good', escrowId: ESCROW_ID });

    await authenticate(harness, client);

    expect(client.data).toEqual(
      expect.objectContaining({ escrowId: ESCROW_ID }),
    );
  });

  it('verifies the token against the access secret', async () => {
    const harness = buildHarness();

    await authenticate(harness, buildClient());

    expect(harness.verifyAsync).toHaveBeenCalledWith('good', { secret: 'access-secret' });
  });

  it('joins the escrow room once connected', async () => {
    const harness = buildHarness();
    const client = buildClient();
    client.data = { user: { id: USER_ID, role: UserRole.USER }, escrowId: ESCROW_ID };

    await harness.gateway.handleConnection(client as unknown as Socket);

    expect(client.join).toHaveBeenCalledWith(chatRoomName(ESCROW_ID));
  });
});

describe('ChatGateway message handling', () => {
  function connectedClient(): SocketLike {
    const client = buildClient();
    client.data = { user: { id: USER_ID, role: UserRole.USER }, escrowId: ESCROW_ID };
    return client;
  }

  it('rejects a malformed payload without touching the service', async () => {
    const harness = buildHarness();
    const client = connectedClient();

    await harness.gateway.onMessageSend(client as unknown as Socket, { body: '' });

    expect(harness.send).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith('message:error', {
      message: 'Invalid message payload',
    });
  });

  it('broadcasts a valid message to everyone in the escrow room', async () => {
    const harness = buildHarness();

    await harness.gateway.onMessageSend(connectedClient() as unknown as Socket, {
      body: 'Has it shipped?',
    });

    expect(harness.send).toHaveBeenCalledWith(
      ESCROW_ID,
      { id: USER_ID, role: UserRole.USER },
      { body: 'Has it shipped?' },
    );
    expect(harness.serverTo).toHaveBeenCalledWith(chatRoomName(ESCROW_ID));
    expect(harness.serverEmit).toHaveBeenCalledWith('message:new', { id: 'message-1', body: 'hi' });
  });

  it('takes the sender identity from the socket, not from the payload', async () => {
    const harness = buildHarness();

    await harness.gateway.onMessageSend(connectedClient() as unknown as Socket, {
      body: 'hello',
      senderId: 'someone-else',
    });

    expect(harness.send).toHaveBeenCalledWith(
      ESCROW_ID,
      { id: USER_ID, role: UserRole.USER },
      expect.objectContaining({ body: 'hello' }),
    );
  });

  it('tells the other participant when a message is read', async () => {
    const harness = buildHarness();
    const client = connectedClient();

    await harness.gateway.onMessageRead(client as unknown as Socket);

    expect(harness.markRead).toHaveBeenCalledWith(ESCROW_ID, { id: USER_ID, role: UserRole.USER });
    expect(client.to).toHaveBeenCalledWith(chatRoomName(ESCROW_ID));
  });

  it('relays an escrow update into the chat room', () => {
    const harness = buildHarness();
    const event = { escrowId: ESCROW_ID, eventType: 'FUNDED', occurredAt: new Date() };

    harness.gateway.onEscrowUpdated(event);

    expect(harness.serverTo).toHaveBeenCalledWith(chatRoomName(ESCROW_ID));
    expect(harness.serverEmit).toHaveBeenCalledWith('escrow:updated', event);
  });
});

import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Server, Socket } from 'socket.io';
import { NotificationsGateway, notificationRoomName } from './notifications.gateway';
import { NotificationResponse } from './dto/notification-response';
import { callArg } from '../../test/support/mock-calls';

const USER_ID = 'user-1';

interface SocketLike {
  handshake: { auth: Record<string, unknown>; query: Record<string, unknown> };
  data: unknown;
  join: jest.Mock;
}

function buildClient(
  auth: Record<string, unknown> = { token: 'good' },
  query: Record<string, unknown> = {},
): SocketLike {
  return {
    handshake: { auth, query },
    data: {},
    join: jest.fn().mockResolvedValue(undefined),
  };
}

interface Harness {
  gateway: NotificationsGateway;
  verifyAsync: jest.Mock;
  serverTo: jest.Mock;
  serverEmit: jest.Mock;
  use: jest.Mock;
}

function buildHarness(): Harness {
  const verifyAsync = jest.fn().mockResolvedValue({ sub: USER_ID });
  const jwtService = { verifyAsync } as unknown as JwtService;

  const configService = {
    getOrThrow: jest.fn().mockReturnValue('access-secret'),
  } as unknown as ConfigService;

  const gateway = new NotificationsGateway(jwtService, configService);

  const serverEmit = jest.fn();
  const serverTo = jest.fn().mockReturnValue({ emit: serverEmit });
  const use = jest.fn();
  gateway.server = { to: serverTo, use } as unknown as Server;

  return { gateway, verifyAsync, serverTo, serverEmit, use };
}

type SocketMiddleware = (client: unknown, next: (error?: Error) => void) => void;

function authenticate(harness: Harness, client: SocketLike): Promise<void> {
  harness.gateway.afterInit(harness.gateway.server);
  const middleware = callArg<SocketMiddleware>(harness.use, 0, 0);

  return new Promise((resolve, reject) => {
    middleware(client, (error?: Error) => (error ? reject(error) : resolve()));
  });
}

describe('NotificationsGateway connection authentication', () => {
  it('rejects a handshake with no token', async () => {
    const harness = buildHarness();

    await expect(authenticate(harness, buildClient({}))).rejects.toThrow('UNAUTHORIZED');
  });

  it('rejects an invalid token', async () => {
    const harness = buildHarness();
    harness.verifyAsync.mockRejectedValue(new Error('jwt malformed'));

    await expect(authenticate(harness, buildClient())).rejects.toThrow('UNAUTHORIZED');
  });

  it('carries a machine-readable rejection code for the client', async () => {
    const harness = buildHarness();

    const error = await authenticate(harness, buildClient({})).catch((caught: Error) => caught);

    expect((error as Error & { data: { code: string } }).data).toEqual({ code: 'UNAUTHORIZED' });
  });

  it('stores the authenticated user id on the socket', async () => {
    const harness = buildHarness();
    const client = buildClient();

    await authenticate(harness, client);

    expect(client.data).toEqual({ userId: USER_ID });
  });

  it('accepts a token from the query string too', async () => {
    const harness = buildHarness();
    const client = buildClient({}, { token: 'good' });

    await authenticate(harness, client);

    expect(client.data).toEqual({ userId: USER_ID });
  });

  it('joins the caller into their own private room', async () => {
    const harness = buildHarness();
    const client = buildClient();
    client.data = { userId: USER_ID };

    await harness.gateway.handleConnection(client as unknown as Socket);

    expect(client.join).toHaveBeenCalledWith(notificationRoomName(USER_ID));
  });
});

describe('NotificationsGateway.emitNotification', () => {
  it('delivers only into the recipient private room', () => {
    const harness = buildHarness();
    const notification = { id: 'notification-1' } as NotificationResponse;

    harness.gateway.emitNotification(USER_ID, notification);

    expect(harness.serverTo).toHaveBeenCalledWith(notificationRoomName(USER_ID));
    expect(harness.serverEmit).toHaveBeenCalledWith('notification:new', notification);
  });

  it('namespaces rooms per user so notifications cannot cross over', () => {
    expect(notificationRoomName('user-1')).not.toBe(notificationRoomName('user-2'));
  });
});

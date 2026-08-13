import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthenticatedUser } from '../types/authenticated-user';
import { UserRole } from '../../users/entities/user-role.enum';

interface RequestLike {
  headers: Record<string, string | undefined>;
  user?: AuthenticatedUser;
}

function buildContext(request: RequestLike): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

interface Harness {
  guard: JwtAuthGuard;
  verifyAsync: jest.Mock;
}

function buildHarness(options: { isPublic?: boolean } = {}): Harness {
  const verifyAsync = jest.fn().mockResolvedValue({ sub: 'user-1', role: UserRole.USER });
  const jwtService = { verifyAsync } as unknown as JwtService;

  const configService = {
    getOrThrow: jest.fn().mockReturnValue('access-secret'),
  } as unknown as ConfigService;

  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(options.isPublic ?? false),
  } as unknown as Reflector;

  return { guard: new JwtAuthGuard(jwtService, configService, reflector), verifyAsync };
}

describe('JwtAuthGuard on protected routes', () => {
  it('refuses a request with no authorization header', async () => {
    const harness = buildHarness();

    await expect(harness.guard.canActivate(buildContext({ headers: {} }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('refuses an authorization header that is not a bearer token', async () => {
    const harness = buildHarness();

    await expect(
      harness.guard.canActivate(buildContext({ headers: { authorization: 'Basic abc' } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(harness.verifyAsync).not.toHaveBeenCalled();
  });

  it('refuses an invalid or expired token', async () => {
    const harness = buildHarness();
    harness.verifyAsync.mockRejectedValue(new Error('jwt expired'));

    await expect(
      harness.guard.canActivate(buildContext({ headers: { authorization: 'Bearer stale' } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('attaches the authenticated user to the request on success', async () => {
    const harness = buildHarness();
    const request: RequestLike = { headers: { authorization: 'Bearer good' } };

    await expect(harness.guard.canActivate(buildContext(request))).resolves.toBe(true);
    expect(request.user).toEqual({ id: 'user-1', role: UserRole.USER });
  });

  it('carries the role from the token onto the request', async () => {
    const harness = buildHarness();
    harness.verifyAsync.mockResolvedValue({ sub: 'admin-1', role: UserRole.ADMIN });
    const request: RequestLike = { headers: { authorization: 'Bearer good' } };

    await harness.guard.canActivate(buildContext(request));

    expect(request.user?.role).toBe(UserRole.ADMIN);
  });

  it('verifies the token against the configured access secret', async () => {
    const harness = buildHarness();

    await harness.guard.canActivate(buildContext({ headers: { authorization: 'Bearer good' } }));

    expect(harness.verifyAsync).toHaveBeenCalledWith('good', { secret: 'access-secret' });
  });
});

describe('JwtAuthGuard on public routes', () => {
  it('lets an anonymous request through', async () => {
    const harness = buildHarness({ isPublic: true });

    await expect(harness.guard.canActivate(buildContext({ headers: {} }))).resolves.toBe(true);
  });

  it('lets a request with a bad token through unauthenticated', async () => {
    const harness = buildHarness({ isPublic: true });
    harness.verifyAsync.mockRejectedValue(new Error('jwt malformed'));
    const request: RequestLike = { headers: { authorization: 'Bearer junk' } };

    await expect(harness.guard.canActivate(buildContext(request))).resolves.toBe(true);
    expect(request.user).toBeUndefined();
  });

  it('still identifies the caller when a valid token is present', async () => {
    const harness = buildHarness({ isPublic: true });
    const request: RequestLike = { headers: { authorization: 'Bearer good' } };

    await harness.guard.canActivate(buildContext(request));

    expect(request.user).toEqual({ id: 'user-1', role: UserRole.USER });
  });
});

import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { AuthenticatedUser } from '../types/authenticated-user';
import { UserRole } from '../../users/entities/user-role.enum';

function buildContext(user?: AuthenticatedUser): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function buildGuard(requiredRoles: UserRole[] | undefined): RolesGuard {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(requiredRoles),
  } as unknown as Reflector;

  return new RolesGuard(reflector);
}

describe('RolesGuard', () => {
  it('allows a route that declares no roles', () => {
    const guard = buildGuard(undefined);

    expect(guard.canActivate(buildContext())).toBe(true);
  });

  it('allows a route whose role list is empty', () => {
    const guard = buildGuard([]);

    expect(guard.canActivate(buildContext())).toBe(true);
  });

  it('allows a user holding the required role', () => {
    const guard = buildGuard([UserRole.ADMIN]);

    expect(guard.canActivate(buildContext({ id: 'u1', role: UserRole.ADMIN }))).toBe(true);
  });

  it('allows a user holding any one of several accepted roles', () => {
    const guard = buildGuard([UserRole.ADMIN, UserRole.ARBITER]);

    expect(guard.canActivate(buildContext({ id: 'u1', role: UserRole.ARBITER }))).toBe(true);
  });

  it('refuses a user whose role is not on the list', () => {
    const guard = buildGuard([UserRole.ADMIN]);

    expect(() => guard.canActivate(buildContext({ id: 'u1', role: UserRole.USER }))).toThrow(
      ForbiddenException,
    );
  });

  it('refuses an unauthenticated request to a role-guarded route', () => {
    const guard = buildGuard([UserRole.ADMIN]);

    expect(() => guard.canActivate(buildContext(undefined))).toThrow(ForbiddenException);
  });

  it('does not tell the caller which role was required', () => {
    const guard = buildGuard([UserRole.ADMIN]);

    try {
      guard.canActivate(buildContext({ id: 'u1', role: UserRole.USER }));
      throw new Error('expected the guard to refuse');
    } catch (error) {
      expect((error as ForbiddenException).message).toBe('Insufficient role for this action');
    }
  });
});

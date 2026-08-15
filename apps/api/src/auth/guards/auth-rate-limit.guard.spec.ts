import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthRateLimitGuard } from './auth-rate-limit.guard';
import { RedisService } from '../../redis/redis.service';
import { RateLimitExceededError } from '../../common/errors/rate-limit-exceeded.error';

const MAX_ATTEMPTS = 5;
const WINDOW_SECONDS = 60;

function buildContext(ip = '203.0.113.7', handlerName = 'login'): ExecutionContext {
  return {
    getHandler: () => ({ name: handlerName }),
    switchToHttp: () => ({ getRequest: () => ({ ip }) }),
  } as unknown as ExecutionContext;
}

interface Harness {
  guard: AuthRateLimitGuard;
  incr: jest.Mock;
  expire: jest.Mock;
}

function buildHarness(attempts: number): Harness {
  const incr = jest.fn().mockResolvedValue(attempts);
  const expire = jest.fn().mockResolvedValue(undefined);
  const redis = { incr, expire } as unknown as RedisService;

  const configService = {
    getOrThrow: jest.fn().mockImplementation((key: string) => {
      if (key === 'AUTH_RATE_LIMIT_MAX_ATTEMPTS') {
        return MAX_ATTEMPTS;
      }
      if (key === 'AUTH_RATE_LIMIT_WINDOW_SECONDS') {
        return WINDOW_SECONDS;
      }
      throw new Error(`Unexpected config key ${key}`);
    }),
  } as unknown as ConfigService;

  return { guard: new AuthRateLimitGuard(redis, configService), incr, expire };
}

describe('AuthRateLimitGuard', () => {
  it('allows the first attempt and opens the window', async () => {
    const harness = buildHarness(1);

    await expect(harness.guard.canActivate(buildContext())).resolves.toBe(true);
    expect(harness.expire).toHaveBeenCalledWith(
      'ratelimit:auth:login:203.0.113.7',
      WINDOW_SECONDS,
    );
  });

  it('does not reset the window on later attempts', async () => {
    const harness = buildHarness(3);

    await harness.guard.canActivate(buildContext());

    expect(harness.expire).not.toHaveBeenCalled();
  });

  it('allows the attempt that lands exactly on the limit', async () => {
    const harness = buildHarness(MAX_ATTEMPTS);

    await expect(harness.guard.canActivate(buildContext())).resolves.toBe(true);
  });

  it('refuses the attempt that goes over the limit', async () => {
    const harness = buildHarness(MAX_ATTEMPTS + 1);

    await expect(harness.guard.canActivate(buildContext())).rejects.toBeInstanceOf(
      RateLimitExceededError,
    );
  });

  it('counts each caller ip separately', async () => {
    const harness = buildHarness(1);

    await harness.guard.canActivate(buildContext('198.51.100.2'));

    expect(harness.incr).toHaveBeenCalledWith('ratelimit:auth:login:198.51.100.2');
  });

  it('counts each auth route separately, so a login flood does not lock registration', async () => {
    const harness = buildHarness(1);

    await harness.guard.canActivate(buildContext('203.0.113.7', 'register'));

    expect(harness.incr).toHaveBeenCalledWith('ratelimit:auth:register:203.0.113.7');
  });

  it('allows the request through when redis is unavailable', async () => {
    const incr = jest.fn().mockRejectedValue(new Error('ERR max requests limit exceeded'));
    const expire = jest.fn().mockResolvedValue(undefined);
    const redis = { incr, expire } as unknown as RedisService;
    const configService = {
      getOrThrow: jest.fn().mockImplementation((key: string) => {
        if (key === 'AUTH_RATE_LIMIT_MAX_ATTEMPTS') {
          return MAX_ATTEMPTS;
        }
        if (key === 'AUTH_RATE_LIMIT_WINDOW_SECONDS') {
          return WINDOW_SECONDS;
        }
        throw new Error(`Unexpected config key ${key}`);
      }),
    } as unknown as ConfigService;
    const guard = new AuthRateLimitGuard(redis, configService);

    await expect(guard.canActivate(buildContext())).resolves.toBe(true);
    expect(expire).not.toHaveBeenCalled();
  });
});

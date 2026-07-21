import type { Request } from 'express';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service';
import { RateLimitExceededError } from '../../common/errors/rate-limit-exceeded.error';

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  constructor(
    private readonly redis: RedisService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const maxAttempts = this.configService.getOrThrow<number>('AUTH_RATE_LIMIT_MAX_ATTEMPTS');
    const windowSeconds = this.configService.getOrThrow<number>(
      'AUTH_RATE_LIMIT_WINDOW_SECONDS',
    );
    const key = `ratelimit:auth:${context.getHandler().name}:${request.ip}`;

    const attempts = await this.redis.incr(key);
    if (attempts === 1) {
      await this.redis.expire(key, windowSeconds);
    }

    if (attempts > maxAttempts) {
      throw new RateLimitExceededError();
    }

    return true;
  }
}

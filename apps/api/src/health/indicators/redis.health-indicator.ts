import { Injectable } from '@nestjs/common';
import { HealthCheckError, HealthIndicatorResult } from '@nestjs/terminus';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class RedisHealthIndicator {
  constructor(private readonly redis: RedisService) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      await this.redis.ping();
      return { [key]: { status: 'up' } };
    } catch (error) {
      throw new HealthCheckError('Redis check failed', {
        [key]: { status: 'down', message: (error as Error).message },
      });
    }
  }
}

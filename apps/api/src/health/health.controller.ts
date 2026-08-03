import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
  HealthIndicatorResult,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { isDatabaseConfigured } from '../database/persistence-mode';
import { JsonStoreHealthIndicator } from './indicators/json-store.health-indicator';
import { RedisHealthIndicator } from './indicators/redis.health-indicator';
import { Public } from '../common/decorators/public.decorator';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly jsonStore: JsonStoreHealthIndicator,
    private readonly redis: RedisHealthIndicator,
  ) {}

  @Public()
  @Get()
  @HealthCheck()
  check(): Promise<HealthCheckResult> {
    return this.health.check([
      (): Promise<HealthIndicatorResult> =>
        isDatabaseConfigured()
          ? this.db.pingCheck('database')
          : this.jsonStore.isHealthy('jsonStore'),
      () => this.redis.isHealthy('redis'),
    ]);
  }
}

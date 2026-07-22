import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Escrow } from '../database/entities/escrow.entity';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';
import { TracingService } from './tracing.service';
import { ALERTS_SERVICE } from './alerts.interface';
import { LoggingAlertsService } from './logging-alerts.service';

@Module({
  imports: [TypeOrmModule.forFeature([Escrow])],
  controllers: [MetricsController],
  providers: [
    MetricsService,
    TracingService,
    LoggingAlertsService,
    { provide: ALERTS_SERVICE, useExisting: LoggingAlertsService },
  ],
  exports: [MetricsService, TracingService, ALERTS_SERVICE],
})
export class ObservabilityModule {}

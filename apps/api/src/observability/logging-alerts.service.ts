import { Injectable, Logger } from '@nestjs/common';
import { Alert, AlertsService } from './alerts.interface';

@Injectable()
export class LoggingAlertsService implements AlertsService {
  private readonly logger = new Logger('Alerts');
  private readonly fired: Alert[] = [];

  fire(alert: Alert): void {
    this.fired.push(alert);
    this.logger.error(`[${alert.severity.toUpperCase()}] ${alert.name}: ${alert.message}`, JSON.stringify(alert.context ?? {}));
  }

  history(): readonly Alert[] {
    return this.fired;
  }
}

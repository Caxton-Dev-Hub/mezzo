export type AlertSeverity = 'warning' | 'critical';

export interface Alert {
  name: string;
  severity: AlertSeverity;
  message: string;
  context?: Record<string, unknown>;
}

export const ALERTS_SERVICE = Symbol('ALERTS_SERVICE');

export interface AlertsService {
  fire(alert: Alert): void;
}

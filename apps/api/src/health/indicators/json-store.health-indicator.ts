import { Injectable, Optional } from '@nestjs/common';
import { HealthCheckError, HealthIndicatorResult } from '@nestjs/terminus';
import { JsonDatabase } from '../../database/json-store/json-database';

@Injectable()
export class JsonStoreHealthIndicator {
  constructor(@Optional() private readonly database?: JsonDatabase) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    if (!this.database) {
      throw new HealthCheckError('JSON store check failed', {
        [key]: { status: 'down', message: 'The JSON store is not configured' },
      });
    }

    try {
      const document = await this.database.load();
      const rows = Object.values(document.tables).reduce(
        (total, table) => total + table.rows.length,
        0,
      );

      return { [key]: { status: 'up', path: this.database.path, rows } };
    } catch (error) {
      throw new HealthCheckError('JSON store check failed', {
        [key]: { status: 'down', message: (error as Error).message },
      });
    }
  }
}

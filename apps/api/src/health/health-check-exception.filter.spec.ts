import { ArgumentsHost, ServiceUnavailableException } from '@nestjs/common';
import { HealthCheckExceptionFilter } from './health-check-exception.filter';

interface Harness {
  filter: HealthCheckExceptionFilter;
  host: ArgumentsHost;
  status: jest.Mock;
  json: jest.Mock;
}

function buildHarness(): Harness {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;

  return { filter: new HealthCheckExceptionFilter(), host, status, json };
}

describe('HealthCheckExceptionFilter', () => {
  it('keeps the indicator that failed instead of a bare status message', () => {
    const harness = buildHarness();
    const report = {
      status: 'error',
      info: { database: { status: 'up' } },
      error: { redis: { status: 'down', message: 'connect ECONNREFUSED' } },
      details: {
        database: { status: 'up' },
        redis: { status: 'down', message: 'connect ECONNREFUSED' },
      },
    };

    harness.filter.catch(new ServiceUnavailableException(report), harness.host);

    expect(harness.status).toHaveBeenCalledWith(503);
    expect(harness.json).toHaveBeenCalledWith(report);
  });
});

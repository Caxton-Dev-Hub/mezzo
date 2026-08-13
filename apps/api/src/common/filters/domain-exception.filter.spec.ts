import {
  ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DomainExceptionFilter } from './domain-exception.filter';
import { DomainError } from '../errors/domain-error';
import { callArg } from '../../../test/support/mock-calls';

class TestDomainError extends DomainError {
  readonly code = 'TEST_DOMAIN_ERROR';
  readonly statusCode = 409;
}

class DetailedDomainError extends DomainError {
  readonly code = 'DETAILED_ERROR';
  readonly statusCode = 422;

  constructor() {
    super('Something specific went wrong', { field: 'price', limit: 100 });
  }
}

interface Harness {
  filter: DomainExceptionFilter;
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

  return { filter: new DomainExceptionFilter(), host, status, json };
}

let loggerError: jest.SpyInstance;

beforeEach(() => {
  loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('DomainExceptionFilter with domain errors', () => {
  it('maps a domain error to its own status and code', () => {
    const harness = buildHarness();

    harness.filter.catch(new TestDomainError('Conflicting state'), harness.host);

    expect(harness.status).toHaveBeenCalledWith(409);
    expect(harness.json).toHaveBeenCalledWith({
      statusCode: 409,
      code: 'TEST_DOMAIN_ERROR',
      message: 'Conflicting state',
    });
  });

  it('passes structured details through to the client', () => {
    const harness = buildHarness();

    harness.filter.catch(new DetailedDomainError(), harness.host);

    expect(harness.json).toHaveBeenCalledWith({
      statusCode: 422,
      code: 'DETAILED_ERROR',
      message: 'Something specific went wrong',
      details: { field: 'price', limit: 100 },
    });
  });

  it('omits the details key entirely when the error carries none', () => {
    const harness = buildHarness();

    harness.filter.catch(new TestDomainError('No details'), harness.host);

    expect(callArg(harness.json, 0, 0)).not.toHaveProperty('details');
  });
});

describe('DomainExceptionFilter with http exceptions', () => {
  it('maps a NotFoundException to a 404 with a named code', () => {
    const harness = buildHarness();

    harness.filter.catch(new NotFoundException('Escrow not found'), harness.host);

    expect(harness.status).toHaveBeenCalledWith(404);
    expect(harness.json).toHaveBeenCalledWith({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'Escrow not found',
    });
  });

  it('maps a ForbiddenException to a 403', () => {
    const harness = buildHarness();

    harness.filter.catch(new ForbiddenException('Insufficient role'), harness.host);

    expect(harness.status).toHaveBeenCalledWith(403);
    expect(callArg<{ code: string }>(harness.json, 0, 0).code).toBe('FORBIDDEN');
  });

  it('joins the several messages of a validation failure into one string', () => {
    const harness = buildHarness();

    harness.filter.catch(
      new BadRequestException(['price is required', 'currency is required']),
      harness.host,
    );

    expect(harness.json).toHaveBeenCalledWith({
      statusCode: 400,
      code: 'BAD_REQUEST',
      message: 'price is required, currency is required',
    });
  });

  it('handles an http exception whose payload is a bare string', () => {
    const harness = buildHarness();

    harness.filter.catch(new HttpException('Teapot', HttpStatus.I_AM_A_TEAPOT), harness.host);

    expect(callArg<{ message: string }>(harness.json, 0, 0).message).toBe('Teapot');
  });
});

describe('DomainExceptionFilter with unexpected failures', () => {
  it('returns a generic 500 rather than leaking the cause', () => {
    const harness = buildHarness();

    harness.filter.catch(new Error('Connection string: postgres://user:secret@host'), harness.host);

    expect(harness.status).toHaveBeenCalledWith(500);
    expect(harness.json).toHaveBeenCalledWith({
      statusCode: 500,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
    });
  });

  it('never puts a stack trace in the response body', () => {
    const harness = buildHarness();

    harness.filter.catch(new Error('boom'), harness.host);

    expect(JSON.stringify(callArg(harness.json, 0, 0))).not.toContain('at ');
  });

  it('logs the stack server-side so the cause is not lost', () => {
    const harness = buildHarness();
    const error = new Error('boom');

    harness.filter.catch(error, harness.host);

    expect(loggerError).toHaveBeenCalledWith(error.stack);
  });

  it('copes with a thrown value that is not an Error at all', () => {
    const harness = buildHarness();

    harness.filter.catch('just a string', harness.host);

    expect(harness.status).toHaveBeenCalledWith(500);
    expect(callArg<{ message: string }>(harness.json, 0, 0).message).toBe('Internal server error');
  });
});

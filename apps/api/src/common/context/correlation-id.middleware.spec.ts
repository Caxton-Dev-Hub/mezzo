import type { NextFunction, Request, Response } from 'express';
import { CORRELATION_ID_HEADER, CorrelationIdMiddleware } from './correlation-id.middleware';
import { RequestContextService } from './request-context';

interface Harness {
  middleware: CorrelationIdMiddleware;
  requestContext: RequestContextService;
  setHeader: jest.Mock;
}

function buildHarness(): Harness {
  const requestContext = new RequestContextService();
  const setHeader = jest.fn();

  return {
    middleware: new CorrelationIdMiddleware(requestContext),
    requestContext,
    setHeader,
  };
}

function buildRequest(headers: Record<string, string | string[]> = {}): Request {
  return { headers } as unknown as Request;
}

describe('CorrelationIdMiddleware', () => {
  it('reuses an incoming correlation id', () => {
    const harness = buildHarness();
    let seen: string | undefined;
    const next = (() => {
      seen = harness.requestContext.correlationId();
    }) as NextFunction;

    harness.middleware.use(
      buildRequest({ [CORRELATION_ID_HEADER]: 'corr-from-caller' }),
      { setHeader: harness.setHeader } as unknown as Response,
      next,
    );

    expect(seen).toBe('corr-from-caller');
  });

  it('generates a correlation id when the caller sends none', () => {
    const harness = buildHarness();
    let seen: string | undefined;
    const next = (() => {
      seen = harness.requestContext.correlationId();
    }) as NextFunction;

    harness.middleware.use(
      buildRequest(),
      { setHeader: harness.setHeader } as unknown as Response,
      next,
    );

    expect(seen).toEqual(expect.any(String) as string);
    expect(seen).toHaveLength(36);
  });

  it('takes the first value when the header is repeated', () => {
    const harness = buildHarness();
    let seen: string | undefined;
    const next = (() => {
      seen = harness.requestContext.correlationId();
    }) as NextFunction;

    harness.middleware.use(
      buildRequest({ [CORRELATION_ID_HEADER]: ['first', 'second'] }),
      { setHeader: harness.setHeader } as unknown as Response,
      next,
    );

    expect(seen).toBe('first');
  });

  it('echoes the correlation id back on the response', () => {
    const harness = buildHarness();

    harness.middleware.use(
      buildRequest({ [CORRELATION_ID_HEADER]: 'corr-1' }),
      { setHeader: harness.setHeader } as unknown as Response,
      (() => undefined) as NextFunction,
    );

    expect(harness.setHeader).toHaveBeenCalledWith(CORRELATION_ID_HEADER, 'corr-1');
  });

  it('leaves no correlation id in scope once the request is done', () => {
    const harness = buildHarness();

    harness.middleware.use(
      buildRequest({ [CORRELATION_ID_HEADER]: 'corr-1' }),
      { setHeader: harness.setHeader } as unknown as Response,
      (() => undefined) as NextFunction,
    );

    expect(harness.requestContext.correlationId()).toBeUndefined();
  });

  it('keeps concurrent requests from seeing each other correlation ids', async () => {
    const harness = buildHarness();
    const seen: string[] = [];

    const run = (id: string): Promise<void> =>
      new Promise((resolve) => {
        harness.middleware.use(
          buildRequest({ [CORRELATION_ID_HEADER]: id }),
          { setHeader: harness.setHeader } as unknown as Response,
          (() => {
            setTimeout(() => {
              seen.push(harness.requestContext.correlationId() ?? 'missing');
              resolve();
            }, 0);
          }) as NextFunction,
        );
      });

    await Promise.all([run('corr-a'), run('corr-b')]);

    expect(seen.sort()).toEqual(['corr-a', 'corr-b']);
  });
});

describe('RequestContextService', () => {
  it('reports no context outside a request', () => {
    const service = new RequestContextService();

    expect(service.get()).toBeUndefined();
    expect(service.correlationId()).toBeUndefined();
  });

  it('exposes the whole store inside a run', () => {
    const service = new RequestContextService();

    const store = service.run({ correlationId: 'corr-1' }, () => service.get());

    expect(store).toEqual({ correlationId: 'corr-1' });
  });

  it('returns the callback result to the caller', () => {
    const service = new RequestContextService();

    expect(service.run({ correlationId: 'corr-1' }, () => 42)).toBe(42);
  });
});

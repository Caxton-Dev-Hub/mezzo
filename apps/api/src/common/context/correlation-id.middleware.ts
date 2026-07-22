import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { Injectable, NestMiddleware } from '@nestjs/common';
import { RequestContextService } from './request-context';

export const CORRELATION_ID_HEADER = 'x-correlation-id';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  constructor(private readonly requestContext: RequestContextService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const headerValue = req.headers[CORRELATION_ID_HEADER];
    const correlationId = (Array.isArray(headerValue) ? headerValue[0] : headerValue) ?? randomUUID();
    res.setHeader(CORRELATION_ID_HEADER, correlationId);
    this.requestContext.run({ correlationId }, next);
  }
}

import type { Response } from 'express';
import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';

/**
 * Terminus names the failing dependency inside the exception payload, but the
 * global DomainExceptionFilter only understands a `{ message }` shape and
 * collapses anything else to a bare "Service Unavailable Exception" — leaving a
 * degraded deployment answering 503 without saying whether the database or
 * Redis is the one that is down. Health is the single endpoint whose body *is*
 * the diagnosis, so it serialises the report itself rather than being
 * normalised into the generic error envelope every other route wants.
 */
@Catch(HttpException)
export class HealthCheckExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    response.status(exception.getStatus()).json(exception.getResponse());
  }
}

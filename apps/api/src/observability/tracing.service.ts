import { Injectable } from '@nestjs/common';
import { SpanStatusCode, trace } from '@opentelemetry/api';

const TRACER_NAME = 'mezzo-api';

@Injectable()
export class TracingService {
  private readonly tracer = trace.getTracer(TRACER_NAME);

  async withSpan<T>(name: string, fn: () => Promise<T>): Promise<T> {
    return this.tracer.startActiveSpan(name, async (span) => {
      try {
        const result = await fn();
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.recordException(error instanceof Error ? error : new Error(String(error)));
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw error;
      } finally {
        span.end();
      }
    });
  }
}

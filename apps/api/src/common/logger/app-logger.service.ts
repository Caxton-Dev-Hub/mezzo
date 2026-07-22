import { ConsoleLogger, Injectable, LoggerService, LogLevel } from '@nestjs/common';
import pino, { Logger as PinoLogger, Level as PinoLevel } from 'pino';
import { ConfigService } from '@nestjs/config';
import { RequestContextService } from '../context/request-context';

const LEVEL_BY_NEST_LEVEL: Record<LogLevel, PinoLevel> = {
  verbose: 'trace',
  debug: 'debug',
  log: 'info',
  warn: 'warn',
  error: 'error',
  fatal: 'fatal',
};

@Injectable()
export class AppLoggerService extends ConsoleLogger implements LoggerService {
  private readonly pinoLogger: PinoLogger;

  constructor(
    private readonly requestContext: RequestContextService,
    configService: ConfigService,
  ) {
    super();
    this.pinoLogger = pino({ level: configService.get<string>('LOG_LEVEL', 'info') });
  }

  log(message: unknown, context?: string): void {
    this.write('log', message, context);
  }

  error(message: unknown, stack?: string, context?: string): void {
    this.write('error', message, context, stack);
  }

  warn(message: unknown, context?: string): void {
    this.write('warn', message, context);
  }

  debug(message: unknown, context?: string): void {
    this.write('debug', message, context);
  }

  verbose(message: unknown, context?: string): void {
    this.write('verbose', message, context);
  }

  private write(level: LogLevel, message: unknown, context?: string, stack?: string): void {
    const correlationId = this.requestContext.correlationId();
    this.pinoLogger[LEVEL_BY_NEST_LEVEL[level]](
      { context, correlationId, ...(stack ? { stack } : {}) },
      typeof message === 'string' ? message : JSON.stringify(message),
    );
  }
}

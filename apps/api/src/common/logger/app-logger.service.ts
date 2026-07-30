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

const NEST_LEVELS_BY_PINO_LEVEL: Record<PinoLevel, LogLevel[]> = {
  trace: ['verbose', 'debug', 'log', 'warn', 'error', 'fatal'],
  debug: ['debug', 'log', 'warn', 'error', 'fatal'],
  info: ['log', 'warn', 'error', 'fatal'],
  warn: ['warn', 'error', 'fatal'],
  error: ['error', 'fatal'],
  fatal: ['fatal'],
};

@Injectable()
export class AppLoggerService extends ConsoleLogger implements LoggerService {
  private readonly pinoLogger: PinoLogger;
  private readonly structured: boolean;

  constructor(
    private readonly requestContext: RequestContextService,
    configService: ConfigService,
  ) {
    super();
    const level = configService.get<PinoLevel>('LOG_LEVEL', 'info');
    this.pinoLogger = pino({ level });
    this.structured = configService.get<string>('NODE_ENV', 'development') === 'production';
    this.setLogLevels(NEST_LEVELS_BY_PINO_LEVEL[level]);
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
    if (!this.structured) {
      this.writeConsole(level, message, context, correlationId, stack);
      return;
    }
    this.pinoLogger[LEVEL_BY_NEST_LEVEL[level]](
      { context, correlationId, ...(stack ? { stack } : {}) },
      typeof message === 'string' ? message : JSON.stringify(message),
    );
  }

  private writeConsole(
    level: LogLevel,
    message: unknown,
    context: string | undefined,
    correlationId: string | undefined,
    stack?: string,
  ): void {
    const scope = correlationId ? `${context ?? 'Application'} ${correlationId}` : context;
    if (level === 'error') {
      super.error(message, stack, scope);
      return;
    }
    super[level](message, scope);
  }
}

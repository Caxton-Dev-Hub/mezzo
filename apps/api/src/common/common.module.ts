import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { DomainExceptionFilter } from './filters/domain-exception.filter';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { RequestContextService } from './context/request-context';
import { CorrelationIdMiddleware } from './context/correlation-id.middleware';
import { AppLoggerService } from './logger/app-logger.service';

@Global()
@Module({
  imports: [JwtModule.register({})],
  providers: [
    RequestContextService,
    AppLoggerService,
    CorrelationIdMiddleware,
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [RequestContextService, AppLoggerService],
})
export class CommonModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}

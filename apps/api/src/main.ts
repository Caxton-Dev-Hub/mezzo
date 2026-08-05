process.env.TZ = 'UTC';

import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppLoggerService } from './common/logger/app-logger.service';
import { bootstrapTracing } from './observability/tracing-bootstrap';

if (process.env.OTEL_ENABLED === 'true') {
  bootstrapTracing(process.env.OTEL_SERVICE_NAME ?? 'mezzo-api');
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { rawBody: true, bufferLogs: true });
  app.useLogger(app.get(AppLoggerService));
  const configService = app.get(ConfigService);
  app.enableCors({
    origin: configService.getOrThrow<string>('CORS_ORIGINS').split(','),
    credentials: true,
  });
  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);
}

void bootstrap();

import 'reflect-metadata';
import { initSentry } from './observability/sentry';

const sentryActivo = initSentry();
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  const port = Number(process.env['WORKER_PORT'] ?? process.env['PORT'] ?? 3001);
  await app.listen(port, '0.0.0.0');

  app
    .get(Logger)
    .log(`Worker escuchando en :${port}${sentryActivo ? ' · Sentry activo' : ''}`, 'Bootstrap');
}

void bootstrap();

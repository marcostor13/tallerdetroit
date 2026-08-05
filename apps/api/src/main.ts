import 'reflect-metadata';
import { initSentry } from './observability/sentry';

// Antes de cualquier otro import con efectos: la instrumentacion automatica
// necesita envolver los modulos desde el principio.
const sentryActivo = initSentry();
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { type EnvironmentVariables, parseCorsOrigins } from './config/configuration';
import { ProblemDetailsFilter } from './common/filters/problem-details.filter';

async function bootstrap(): Promise<void> {
  // `abortOnError: false` hace que un fallo de inicialización se propague como
  // excepción en lugar de matar el proceso en silencio: con `bufferLogs` los
  // logs aún no se han volcado y el contenedor moriría sin dejar rastro.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    abortOnError: false,
  });

  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService<EnvironmentVariables, true>);
  const nodeEnv = config.get('NODE_ENV', { infer: true });
  const port = config.get('PORT', { infer: true });

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cookieParser());

  // `credentials: true` es necesario para la cookie httpOnly del refresh token.
  app.enableCors({
    origin: parseCorsOrigins(config.get('CORS_ORIGINS', { infer: true })),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'If-Match', 'X-Client-Op-Id'],
    exposedHeaders: ['ETag', 'Location'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new ProblemDetailsFilter());

  // Los contenedores corren con NODE_ENV=production también en develop, así que
  // ese valor no sirve para decidir esto: se controla con una variable propia.
  // Por defecto la documentación queda expuesta solo fuera de producción.
  const docsEnabled = config.get('ENABLE_API_DOCS', { infer: true }) ?? nodeEnv !== 'production';

  if (docsEnabled) {
    const swagger = new DocumentBuilder()
      .setTitle('Informes Técnicos — Detroit Power System Perú')
      .setDescription(
        'API de la plataforma corporativa de informes técnicos. Formato controlado SER-FOR-002.',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .addTag('health', 'Estado del servicio')
      .addTag('auth', 'Autenticación y sesiones')
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swagger), {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  app.enableShutdownHooks();

  await app.listen(port, '0.0.0.0');
  app
    .get(Logger)
    .log(
      `API escuchando en :${port} · entorno ${nodeEnv}` +
        `${docsEnabled ? ' · docs en /api/docs' : ''}` +
        `${sentryActivo ? ' · Sentry activo' : ''}`,
      'Bootstrap',
    );
}

bootstrap().catch((error: unknown) => {
  // Único punto donde se escribe a la consola directamente: si el arranque
  // falla, el logger estructurado todavía no existe y este mensaje es lo único
  // que verá quien mire los logs del contenedor.
  console.error('[bootstrap] La API no pudo arrancar.');
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exit(1);
});

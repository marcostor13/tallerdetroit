import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { BullModule } from '@nestjs/bullmq';
import { HealthController } from './health.controller';
import { DocumentsModule } from './documents/documents.module';

/**
 * Worker de trabajo pesado: render de PDF con Chromium, export DOCX y derivados
 * de imagen.
 *
 * Vive en un servicio separado de la API a propósito: cada render consume
 * 300–600 MB de RAM y, dentro de la API, un informe de 60 fotos tumbaría el
 * servicio para todos los usuarios (§15.2, riesgo R6).
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level: config.get<string>('LOG_LEVEL') ?? 'info',
          transport:
            config.get<string>('NODE_ENV') === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
        },
      }),
    }),

    // La cola desacopla la emisión del render: el técnico no espera 40 s
    // mirando una pantalla mientras Chromium trabaja.
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: { url: config.get<string>('REDIS_URL') ?? 'redis://localhost:6379' },
        defaultJobOptions: {
          // Tres intentos con espera creciente: los fallos de render suelen ser
          // una imagen que tardó de más, y a la segunda ya está en caché.
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: { age: 86_400, count: 500 },
          removeOnFail: { age: 604_800 },
        },
      }),
    }),

    DocumentsModule,

    // F2 (E2.6 tablas de medición) y derivados de imagen.
  ],
  controllers: [HealthController],
})
export class AppModule {}

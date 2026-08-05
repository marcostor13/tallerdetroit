import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { HealthController } from './health.controller';

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

    // Colas BullMQ y procesadores — se incorporan en F1 (E1.7 render de PDF)
    // y F2 (E2.6 tablas de medición).
  ],
  controllers: [HealthController],
})
export class AppModule {}

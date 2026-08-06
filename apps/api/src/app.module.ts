import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { EnvironmentVariables, validateEnv } from './config/configuration';
import { HealthModule } from './health/health.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { MastersModule } from './masters/masters.module';
import { TemplatesModule } from './templates/templates.module';
import { WorkOrdersModule } from './work-orders/work-orders.module';
import { ReportsModule } from './reports/reports.module';
import { MediaModule } from './media/media.module';
import { DocumentsModule } from './documents/documents.module';
import { AuditModule } from './audit/audit.module';
import { BullModule } from '@nestjs/bullmq';
import { IndexesService } from './common/indexes.service';
import { AppThrottlerGuard } from './common/guards/app-throttler.guard';
import { RequestContextInterceptor } from './common/request-context';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
      envFilePath: ['.env.local', '.env'],
    }),

    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL', { infer: true }),
          transport:
            config.get('NODE_ENV', { infer: true }) === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true, translateTime: 'HH:MM:ss' } }
              : undefined,
          // Nunca registrar credenciales ni tokens (§20).
          redact: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.body.password',
            'req.body.totp',
            'res.headers["set-cookie"]',
          ],
          autoLogging: { ignore: (req) => req.url?.includes('/health') ?? false },
        },
      }),
    }),

    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => ({
        uri: config.get('MONGODB_URI', { infer: true }),
        autoIndex: config.get('NODE_ENV', { infer: true }) !== 'production',
        // Fallar rápido y ruidoso. Con los tiempos por defecto, una base
        // inalcanzable deja el arranque colgado: el contenedor queda vivo pero
        // sin escuchar, el healthcheck falla y en los logs no aparece la causa.
        retryAttempts: 3,
        retryDelay: 2000,
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000,
      }),
    }),

    // Cola de render documental. El informe se emite al instante y el PDF se
    // genera aparte: 45 fotos tardan decenas de segundos y el técnico no debe
    // esperarlas mirando una pantalla.
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => ({
        connection: {
          url: config.get('REDIS_URL', { infer: true }) ?? 'redis://localhost:6379',
          // Con la cola offline activada —que es lo que trae por defecto— los
          // comandos se acumulan en memoria mientras Redis no responde, y la
          // petición que los lanzó se queda esperando indefinidamente. Aquí
          // interesa lo contrario: que falle rápido y en voz alta.
          maxRetriesPerRequest: 2,
          enableOfflineQueue: false,
          connectTimeout: 3_000,
        },
      }),
    }),

    // Límite de peticiones por IP/usuario (§17).
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),

    // Global: la regla del proyecto es que toda escritura relevante deje
    // registro, asi que no puede depender de que cada modulo lo importe.
    AuditModule,

    HealthModule,
    UsersModule,
    AuthModule,
    MastersModule,
    TemplatesModule,
    WorkOrdersModule,
    ReportsModule,
    MediaModule,
    DocumentsModule,

    // Módulos de dominio de §15.3 — se incorporan por fase según docs/PLAN.md:
    // DocumentsModule (F1) · MeasurementsModule (F2) · AuditModule (F3) ·
    // NotificationsModule (F3) · SyncModule (F4) · AnalyticsModule (F5) ·
    // IntegrationsModule (F6).
  ],
  providers: [
    // Los índices únicos se crean antes de atender la primera petición: con
    // autoIndex apagado en producción no existían, y sin ellos dos informes
    // pueden compartir número (RN-01).
    IndexesService,

    // El orden importa: primero se limita, luego se autentica y por ultimo se
    // autoriza. Toda ruta queda protegida por defecto; las publicas lo declaran
    // con @Public(), que es mas seguro que tener que acordarse de proteger.
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },

    // La IP y el user-agent viajan por AsyncLocalStorage hasta la auditoria:
    // pasarlos por parametro obligaria a anadir un argumento HTTP a una
    // veintena de metodos de dominio que no tienen nada que ver con HTTP.
    { provide: APP_INTERCEPTOR, useClass: RequestContextInterceptor },
  ],
})
export class AppModule {}

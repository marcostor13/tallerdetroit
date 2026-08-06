import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { EnvironmentVariables, validateEnv } from './config/configuration';
import { HealthModule } from './health/health.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { MastersModule } from './masters/masters.module';
import { AppThrottlerGuard } from './common/guards/app-throttler.guard';
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

    // Límite de peticiones por IP/usuario (§17).
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),

    HealthModule,
    UsersModule,
    AuthModule,
    MastersModule,

    // Módulos de dominio de §15.3 — se incorporan por fase según docs/PLAN.md:
    // WorkOrdersModule,
    // TemplatesModule, ReportsModule, SequencesModule, MediaModule,
    // DocumentsModule (F1) · MeasurementsModule (F2) · AuditModule,
    // NotificationsModule (F3) · SyncModule (F4) · AnalyticsModule (F5) ·
    // IntegrationsModule (F6).
  ],
  providers: [
    // El orden importa: primero se limita, luego se autentica y por ultimo se
    // autoriza. Toda ruta queda protegida por defecto; las publicas lo declaran
    // con @Public(), que es mas seguro que tener que acordarse de proteger.
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}

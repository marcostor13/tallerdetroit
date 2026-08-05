import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { type EnvironmentVariables, parseCorsOrigins } from './config/configuration';
import { ProblemDetailsFilter } from './common/filters/problem-details.filter';
import { testUri } from './test-setup/test-uri';

// `AppModule` NO se importa arriba a propósito: `ConfigModule.forRoot()` valida
// el entorno en el momento en que el módulo se carga, así que hay que preparar
// las variables antes y traerlo con un import dinámico.

/**
 * Prueba de humo del arranque.
 *
 * Existe por un fallo real: la API construía, el contenedor levantaba y moría
 * en `bootstrap()` porque a `corsOrigins` se le pasaba el ConfigService en vez
 * del valor. Ningún test lo tocaba, porque ninguno llegaba a arrancar la app.
 * Este sí: replica la secuencia de `main.ts` y comprueba que responde.
 */
describe('Arranque de la API', () => {
  let app: NestExpressApplication;
  /** Lo que realmente se le pasó a `enableCors`, no un valor recalculado. */
  let origenesAplicados: string[];

  beforeAll(async () => {
    Object.assign(process.env, {
      NODE_ENV: 'test',
      // `app.init()` no abre un puerto; el valor solo tiene que pasar la validación.
      PORT: '3000',
      LOG_LEVEL: 'error',
      MONGODB_URI: testUri('dps-bootstrap-test'),
      JWT_ACCESS_SECRET: 'a'.repeat(64),
      JWT_REFRESH_SECRET: 'b'.repeat(64),
      CORS_ORIGINS: 'https://dev-tallerdetroit.tecdidata.com,https://tallerdetroit.tecdidata.com',
    });

    const { AppModule } = await import('./app.module');

    app = await NestFactory.create<NestExpressApplication>(AppModule, {
      abortOnError: false,
      logger: false,
    });

    // Misma secuencia que main.ts: si algo de aquí falla, el contenedor muere.
    const config = app.get(ConfigService<EnvironmentVariables, true>);
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    origenesAplicados = parseCorsOrigins(config.get('CORS_ORIGINS', { infer: true }));
    app.enableCors({ origin: origenesAplicados, credentials: true });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new ProblemDetailsFilter());

    await app.init();
  }, 180_000);

  afterAll(async () => {
    await app?.close();
  });

  it('arranca sin lanzar excepciones', () => {
    expect(app).toBeDefined();
  });

  /**
   * Comprueba el array que se le pasó a `enableCors`, no uno recalculado: si se
   * vuelve a leer la configuración por el sitio equivocado, `parseCorsOrigins`
   * devuelve `[]` y CORS queda mudo sin que nada falle. Eso es peor que una
   * excepción, porque el contenedor arranca sano y el frontend recibe errores
   * de CORS en producción.
   */
  it('aplica a CORS los orígenes de la configuración, y no una lista vacía', () => {
    expect(origenesAplicados).toEqual([
      'https://dev-tallerdetroit.tecdidata.com',
      'https://tallerdetroit.tecdidata.com',
    ]);
    expect(origenesAplicados.length).toBeGreaterThan(0);
  });

  it('/api/v1/health responde 200 con la base conectada', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.info.mongodb.status).toBe('up');
  }, 30_000);

  it('/api/v1/health/live responde sin sesión', async () => {
    await request(app.getHttpServer()).get('/api/v1/health/live').expect(200, { status: 'ok' });
  });

  it('una ruta inexistente devuelve el formato RFC 7807', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/no-existe').expect(404);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({ status: 404, title: 'No encontrado' });
  });
});

import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import mongoose from 'mongoose';
import { testUri } from '../test-setup/test-uri';
import { ProblemDetailsFilter } from '../common/filters/problem-details.filter';

/**
 * Motor de plantillas contra una base real.
 *
 * Lo que decide F1 es que los dos informes reales salgan distintos **sin tocar
 * código**, y que una versión ya publicada no se pueda alterar: si cambiara,
 * cambiarían informes ya firmados.
 */
describe('Plantillas', () => {
  let app: NestExpressApplication;
  let http: ReturnType<NestExpressApplication['getHttpServer']>;
  let tokenAdmin: string;
  let tokenCalidad: string;
  let tokenTecnico: string;

  const PASSWORD = 'ContrasenaDePrueba2026';

  const login = async (email: string): Promise<string> => {
    const r = await request(http).post('/api/v1/auth/login').send({ email, password: PASSWORD });
    return r.body.accessToken as string;
  };

  beforeAll(async () => {
    Object.assign(process.env, {
      NODE_ENV: 'test',
      PORT: '3000',
      LOG_LEVEL: 'error',
      MONGODB_URI: testUri('dps-templates-test'),
      JWT_ACCESS_SECRET: 'a'.repeat(64),
      JWT_REFRESH_SECRET: 'b'.repeat(64),
      CORS_ORIGINS: 'https://dev-tallerdetroit.tecdidata.com',
      SEED_PASSWORD: PASSWORD,
    });

    const { seedUsers } = await import('../seeds/users.seed');
    await seedUsers(process.env['MONGODB_URI'] as string);

    const { seedTemplates } = await import('../seeds/templates.seed');
    await seedTemplates(process.env['MONGODB_URI'] as string);

    const { AppModule } = await import('../app.module');
    app = await NestFactory.create<NestExpressApplication>(AppModule, {
      abortOnError: false,
      logger: false,
    });
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();
    http = app.getHttpServer();

    tokenAdmin = await login('admin@detroitpower.pe');
    tokenCalidad = await login('calidad@detroitpower.pe');
    tokenTecnico = await login('rcaceres@detroitpower.pe');
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await mongoose.disconnect().catch(() => undefined);
  });

  it('la semilla deja SER-FOR-002 v01 publicada', async () => {
    const r = await request(http)
      .get('/api/v1/templates/SER-FOR-002/vigente')
      .set('Authorization', `Bearer ${tokenTecnico}`)
      .expect(200);

    expect(r.body.version).toBe('v01');
    expect(r.body.estado).toBe('publicada');
    expect(r.body.secciones).toHaveLength(11);
  }, 30_000);

  it('la semilla es idempotente: repetirla no duplica ni republica', async () => {
    const { seedTemplates } = await import('../seeds/templates.seed');
    await seedTemplates(process.env['MONGODB_URI'] as string);

    const r = await request(http)
      .get('/api/v1/templates/SER-FOR-002/versiones')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);

    expect(r.body.items.filter((v: { version: string }) => v.version === 'v01')).toHaveLength(1);
  }, 60_000);

  // --- §11.3: el motivo por el que existe el motor de plantillas ---

  it('el panel de ECU no se resuelve para un camión minero y sí para un grupo electrógeno', async () => {
    const resolver = async (categoria: string) => {
      const r = await request(http)
        .post('/api/v1/templates/SER-FOR-002/resolver')
        .set('Authorization', `Bearer ${tokenTecnico}`)
        .send({
          equipo: { categoria },
          motor: { tieneCac: true },
          intervencion: { codigo: 'QL4' },
          informe: { tercerizados: [], mediciones: [] },
        })
        .expect(201);
      return (r.body as { clave: string }[]).map((s) => s.clave);
    };

    expect(await resolver('camion_minero')).not.toContain('parametros-ecu');
    expect(await resolver('grupo_electrogeno')).toContain('parametros-ecu');
  }, 30_000);

  it('el criterio de F1: OT-746 y OT-898 resuelven distinto sin tocar código', async () => {
    const resolver = async (contexto: Record<string, unknown>) => {
      const r = await request(http)
        .post('/api/v1/templates/SER-FOR-002/resolver')
        .set('Authorization', `Bearer ${tokenTecnico}`)
        .send(contexto)
        .expect(201);
      return (r.body as { clave: string }[]).map((s) => s.clave);
    };

    const ot746 = await resolver({
      equipo: { categoria: 'camion_minero' },
      motor: { cilindros: 20 },
      intervencion: { codigo: 'QL4' },
      informe: { tercerizados: [], mediciones: [] },
    });
    const ot898 = await resolver({
      equipo: { categoria: 'camion_minero' },
      motor: { cilindros: 16 },
      intervencion: { codigo: 'W6-1' },
      informe: { tercerizados: [{ descripcion: 'Rectificado' }], mediciones: [] },
    });

    expect(ot746).not.toContain('tercerizados');
    expect(ot898).toContain('tercerizados');
    expect(ot746).toContain('trabajos');
    expect(ot898).toContain('trabajos');
  }, 30_000);

  // --- §11.1: inmutabilidad ---

  it('una versión publicada no se puede modificar', async () => {
    const r = await request(http)
      .patch('/api/v1/templates/SER-FOR-002/versiones/v01')
      .set('Authorization', `Bearer ${tokenCalidad}`)
      .send({ secciones: [] })
      .expect(409);

    expect(r.body.detail).toMatch(/no se puede modificar/i);
  }, 30_000);

  it('publicar dos veces la misma versión es un conflicto, no un doble alta', async () => {
    const r = await request(http)
      .post('/api/v1/templates/SER-FOR-002/versiones/v01/publicar')
      .set('Authorization', `Bearer ${tokenCalidad}`)
      .expect(409);

    expect(r.body.detail).toMatch(/ya estaba publicada/i);
  }, 30_000);

  it('Calidad crea v02 en borrador, la edita y la publica', async () => {
    await request(http)
      .post('/api/v1/templates/SER-FOR-002/versiones')
      .set('Authorization', `Bearer ${tokenCalidad}`)
      .send({ version: 'v02' })
      .expect(201);

    await request(http)
      .patch('/api/v1/templates/SER-FOR-002/versiones/v02')
      .set('Authorization', `Bearer ${tokenCalidad}`)
      .send({
        secciones: [
          {
            clave: 'antecedentes',
            numeral: 'I',
            titulo: 'Antecedentes',
            orden: 1,
            paso: 1,
            bloques: [
              { clave: 'antecedentes', tipo: 'rich_text', titulo: 'Antecedentes', orden: 1 },
            ],
          },
        ],
      })
      .expect(200);

    await request(http)
      .post('/api/v1/templates/SER-FOR-002/versiones/v02/publicar')
      .set('Authorization', `Bearer ${tokenCalidad}`)
      .expect(201);

    // Los informes nuevos ya nacen con v02; v01 sigue existiendo para los que
    // se emitieron con ella.
    const vigente = await request(http)
      .get('/api/v1/templates/SER-FOR-002/vigente')
      .set('Authorization', `Bearer ${tokenTecnico}`)
      .expect(200);
    expect(vigente.body.version).toBe('v02');

    const v01 = await request(http)
      .get('/api/v1/templates/SER-FOR-002/versiones/v01')
      .set('Authorization', `Bearer ${tokenTecnico}`)
      .expect(200);
    expect(v01.body.secciones).toHaveLength(11);
  }, 60_000);

  it('no publica una versión incoherente y dice exactamente qué falla', async () => {
    await request(http)
      .post('/api/v1/templates/SER-FOR-002/versiones')
      .set('Authorization', `Bearer ${tokenCalidad}`)
      .send({
        version: 'v99',
        secciones: [
          {
            clave: 'a',
            numeral: 'I',
            titulo: 'Con regla rota',
            orden: 1,
            paso: 1,
            visibleSi: 'esto no es una regla !!',
            bloques: [{ clave: 'x', tipo: 'rich_text', titulo: 'X', orden: 1 }],
          },
        ],
      })
      .expect(201);

    const r = await request(http)
      .post('/api/v1/templates/SER-FOR-002/versiones/v99/publicar')
      .set('Authorization', `Bearer ${tokenCalidad}`)
      .expect(400);

    // En ejecución esa regla se ignoraría y la sección se mostraría siempre;
    // publicar es el único momento en que la errata sale a la luz.
    expect(r.body.detail).toMatch(/Regla de visibilidad inválida/);
  }, 30_000);

  // --- RBAC ---

  it('el técnico lee plantillas pero no las publica', async () => {
    await request(http)
      .get('/api/v1/templates')
      .set('Authorization', `Bearer ${tokenTecnico}`)
      .expect(200);

    await request(http)
      .post('/api/v1/templates/SER-FOR-002/versiones')
      .set('Authorization', `Bearer ${tokenTecnico}`)
      .send({ version: 'v03' })
      .expect(403);
  }, 30_000);

  it('sin token no se accede', async () => {
    await request(http).get('/api/v1/templates/SER-FOR-002/vigente').expect(401);
  });

  it('una plantilla inexistente devuelve 404, no 500', async () => {
    const r = await request(http)
      .get('/api/v1/templates/INVENTADA/vigente')
      .set('Authorization', `Bearer ${tokenTecnico}`)
      .expect(404);
    expect(r.body.detail).toMatch(/No hay ninguna versión publicada/);
  }, 30_000);
});

import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import mongoose from 'mongoose';
import { testUri } from '../test-setup/test-uri';
import { ProblemDetailsFilter } from '../common/filters/problem-details.filter';

/**
 * Maestros de F1 contra una base real.
 *
 * Lo que se comprueba aquí es exactamente lo que decide que el catálogo se use
 * o se abandone (§13.3): que se pueda crear al vuelo sin salir del informe, y
 * que la búsqueda encuentre pese a las erratas.
 */
describe('Maestros', () => {
  let app: NestExpressApplication;
  let http: ReturnType<NestExpressApplication['getHttpServer']>;
  let tokenAdmin: string;
  let tokenTecnico: string;
  let tokenVisor: string;
  let clienteId: string;

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
      MONGODB_URI: testUri('dps-masters-test'),
      JWT_ACCESS_SECRET: 'a'.repeat(64),
      JWT_REFRESH_SECRET: 'b'.repeat(64),
      CORS_ORIGINS: 'https://dev-tallerdetroit.tecdidata.com',
      SEED_PASSWORD: PASSWORD,
    });

    const { seedUsers } = await import('../seeds/users.seed');
    await seedUsers(process.env['MONGODB_URI'] as string);

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
    tokenTecnico = await login('rcaceres@detroitpower.pe');
    tokenVisor = await login('gerencia@detroitpower.pe');
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await mongoose.disconnect().catch(() => undefined);
  });

  it('lista los maestros disponibles', async () => {
    const r = await request(http)
      .get('/api/v1/masters')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);

    expect(r.body.maestros).toContain('clients');
    expect(r.body.maestros).toContain('engines');
    expect(r.body.maestros).toContain('engine-models');
  });

  it('crea un cliente y lo devuelve en el listado', async () => {
    const r = await request(http)
      .post('/api/v1/masters/clients')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({
        razonSocial: 'SOUTHERN PERU COPPER CORPORATION',
        nombreCorto: 'SPCC. TOQUEPALA',
        ruc: '20100147514',
      })
      .expect(201);

    clienteId = String(r.body._id);
    expect(r.body.pendienteValidacion).toBe(false);

    const lista = await request(http)
      .get('/api/v1/masters/clients')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);
    expect(lista.body.total).toBeGreaterThanOrEqual(1);
  }, 30_000);

  it('rechaza un RUC duplicado con un mensaje comprensible', async () => {
    const r = await request(http)
      .post('/api/v1/masters/clients')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ razonSocial: 'OTRA EMPRESA', nombreCorto: 'OTRA', ruc: '20100147514' })
      .expect(409);

    expect(r.body.detail).toMatch(/Ya existe un cliente/);
    expect(r.body.detail).toContain('20100147514');
  }, 30_000);

  // --- §13.3.2: la búsqueda tiene que perdonar las erratas ---

  it('encuentra el cliente pese a escribirlo mal', async () => {
    for (const consulta of ['toquepala', 'TOQEPALA', 'southern', 'spcc']) {
      const r = await request(http)
        .get(`/api/v1/masters/clients?q=${encodeURIComponent(consulta)}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(200);
      expect(r.body.items[0]?.nombreCorto).toBe('SPCC. TOQUEPALA');
    }
  }, 30_000);

  it('el caso literal de la especificación: KOMATZU encuentra KOMATSU', async () => {
    await request(http)
      .post('/api/v1/masters/equipment-brands')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ nombre: 'KOMATSU' })
      .expect(201);

    const r = await request(http)
      .get('/api/v1/masters/equipment-brands?q=KOMATZU')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);

    expect(r.body.items[0]?.nombre).toBe('KOMATSU');
  }, 30_000);

  // --- §13.3.1: creación inline, sin la cual el proyecto fracasa ---

  it('el técnico crea una sede al vuelo y queda pendiente de validación', async () => {
    const r = await request(http)
      .post('/api/v1/masters/sites?inline=true')
      .set('Authorization', `Bearer ${tokenTecnico}`)
      .send({ nombre: 'TALLER - LIMA', clienteId, tipo: 'taller' })
      .expect(201);

    expect(r.body.pendienteValidacion).toBe(true);
    expect(r.body.nombre).toBe('TALLER - LIMA');
  }, 30_000);

  it('la creación inline solo admite los campos mínimos', async () => {
    const r = await request(http)
      .post('/api/v1/masters/sites?inline=true')
      .set('Authorization', `Bearer ${tokenTecnico}`)
      .send({ nombre: 'OTRA SEDE', clienteId, direccion: 'no permitida aqui' })
      .expect(400);

    expect(r.body.detail).toMatch(/creación rápida/i);
  }, 30_000);

  it('los modelos de motor NO se crean al vuelo: de ellos dependen las grillas', async () => {
    const r = await request(http)
      .post('/api/v1/masters/engine-models?inline=true')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ denominacion: '20V4000C23' })
      .expect(400);

    expect(r.body.detail).toMatch(/no admite creación rápida/i);
  }, 30_000);

  // --- Cascada del wizard ---

  it('las sedes se filtran por cliente', async () => {
    const otro = await request(http)
      .post('/api/v1/masters/clients')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ razonSocial: 'TECNOLOGICA DE ALIMENTOS S.A.', nombreCorto: 'TASA' })
      .expect(201);

    const propias = await request(http)
      .get(`/api/v1/masters/sites?clienteId=${clienteId}`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);
    expect(propias.body.total).toBeGreaterThanOrEqual(1);

    const ajenas = await request(http)
      .get(`/api/v1/masters/sites?clienteId=${String(otro.body._id)}`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);
    expect(ajenas.body.total).toBe(0);
  }, 30_000);

  // --- RBAC y borrado ---

  it('el visor puede leer pero no escribir', async () => {
    await request(http)
      .get('/api/v1/masters/clients')
      .set('Authorization', `Bearer ${tokenVisor}`)
      .expect(200);

    await request(http)
      .post('/api/v1/masters/clients')
      .set('Authorization', `Bearer ${tokenVisor}`)
      .send({ razonSocial: 'NO DEBERIA', nombreCorto: 'NO' })
      .expect(403);
  }, 30_000);

  it('el borrado es lógico: desaparece del listado pero el registro sigue', async () => {
    const creado = await request(http)
      .post('/api/v1/masters/positions')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ denominacion: 'CARGO TEMPORAL' })
      .expect(201);

    const id = String(creado.body._id);
    await request(http)
      .delete(`/api/v1/masters/positions/${id}`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);

    const lista = await request(http)
      .get('/api/v1/masters/positions?q=CARGO TEMPORAL')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);
    expect(lista.body.items).toHaveLength(0);

    // Sigue en la base: un informe emitido debe poder resolver la referencia.
    // Se consulta por la API con incluirInactivos, que es la vista de
    // administración; `mongoose.connection` global no es la de la aplicación.
    const conBajas = await request(http)
      .get('/api/v1/masters/positions?incluirInactivos=true')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);
    const items = conBajas.body.items as { _id: string; deletedAt: string | null }[];
    const borrado = items.find((x) => x._id === id);
    expect(borrado).toBeTruthy();
    expect(borrado?.deletedAt).toBeTruthy();
  }, 30_000);

  it('un maestro inexistente devuelve 404, no 500', async () => {
    const r = await request(http)
      .get('/api/v1/masters/inventado')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(404);
    expect(r.body.detail).toMatch(/No existe el maestro/);
  });

  it('sin token no se accede a ningún maestro', async () => {
    await request(http).get('/api/v1/masters/clients').expect(401);
  });

  it('deja constancia de quién creó cada registro', async () => {
    const r = await request(http)
      .get(`/api/v1/masters/clients/${clienteId}`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);
    expect(r.body.createdBy).toBeTruthy();
    expect(r.body.updatedBy).toBeTruthy();
  }, 30_000);
});

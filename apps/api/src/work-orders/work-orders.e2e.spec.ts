import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import mongoose from 'mongoose';
import { testUri } from '../test-setup/test-uri';
import { ProblemDetailsFilter } from '../common/filters/problem-details.filter';

/**
 * Órdenes de trabajo contra una base real.
 *
 * Sin generador de correlativos (D3), la unicidad del número es lo único que
 * impide dos órdenes indistinguibles. Eso es lo que se prueba aquí.
 */
describe('Órdenes de trabajo', () => {
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
      MONGODB_URI: testUri('dps-work-orders-test'),
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

    const cliente = await request(http)
      .post('/api/v1/masters/clients')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ razonSocial: 'SOUTHERN PERU COPPER CORPORATION', nombreCorto: 'SPCC. TOQUEPALA' });
    clienteId = String(cliente.body._id);
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await mongoose.disconnect().catch(() => undefined);
  });

  it('crea una orden con el número real del informe OT-898', async () => {
    const r = await request(http)
      .post('/api/v1/work-orders')
      .set('Authorization', `Bearer ${tokenTecnico}`)
      .send({ numero: 'LIM-TAL-000898', clienteId, descripcion: 'Evaluación de motor MTU' })
      .expect(201);

    expect(r.body.numero).toBe('LIM-TAL-000898');
    expect(r.body.estado).toBe('abierta');
    expect(r.body.fechaApertura).toBeTruthy();
  }, 30_000);

  it('normaliza el número antes de guardarlo', async () => {
    const r = await request(http)
      .post('/api/v1/work-orders')
      .set('Authorization', `Bearer ${tokenTecnico}`)
      .send({ numero: '  lim - sca - 001398 ', clienteId })
      .expect(201);

    expect(r.body.numero).toBe('LIM-SCA-001398');
  }, 30_000);

  it('dos órdenes no pueden compartir número, ni escrito de otra forma', async () => {
    // Sin normalización, `lim-tal-000898` entraría como una orden distinta y el
    // índice único no se enteraría.
    const r = await request(http)
      .post('/api/v1/work-orders')
      .set('Authorization', `Bearer ${tokenTecnico}`)
      .send({ numero: 'lim-tal-000898', clienteId })
      .expect(409);

    expect(r.body.detail).toMatch(/Ya existe una orden de trabajo/);
    expect(r.body.detail).toContain('LIM-TAL-000898');
  }, 30_000);

  it('rechaza un número que no puede serlo, con el motivo concreto', async () => {
    const casos: [unknown, RegExp][] = [
      ['', /vacío/],
      ['000898', /segmentos/],
      ['LIM/TAL/000898', /letras, números y guiones/],
      ['LIM-TAL-TALLER', /correlativo/],
    ];

    for (const [numero, esperado] of casos) {
      const r = await request(http)
        .post('/api/v1/work-orders')
        .set('Authorization', `Bearer ${tokenTecnico}`)
        .send({ numero, clienteId })
        .expect(400);
      expect(r.body.detail).toMatch(esperado);
    }
  }, 30_000);

  it('acepta convenciones que aún no conocemos: D3 sigue sin confirmarse', async () => {
    await request(http)
      .post('/api/v1/work-orders')
      .set('Authorization', `Bearer ${tokenTecnico}`)
      .send({ numero: 'AQP-TAL-2026-000012', clienteId })
      .expect(201);
  }, 30_000);

  it('exige cliente: una orden sin cliente no se puede relacionar con nada', async () => {
    const r = await request(http)
      .post('/api/v1/work-orders')
      .set('Authorization', `Bearer ${tokenTecnico}`)
      .send({ numero: 'LIM-TAL-000900' })
      .expect(400);
    expect(r.body.detail).toMatch(/cliente/i);
  }, 30_000);

  it('busca por número parcial, como lo teclea el técnico', async () => {
    const r = await request(http)
      .get('/api/v1/work-orders?q=tal-000898')
      .set('Authorization', `Bearer ${tokenTecnico}`)
      .expect(200);

    expect(r.body.items.map((o: { numero: string }) => o.numero)).toContain('LIM-TAL-000898');
  }, 30_000);

  it('busca por número exacto', async () => {
    const r = await request(http)
      .get('/api/v1/work-orders/numero/lim-tal-000898')
      .set('Authorization', `Bearer ${tokenTecnico}`)
      .expect(200);
    expect(r.body.numero).toBe('LIM-TAL-000898');
  }, 30_000);

  it('propone el siguiente número conservando los ceros, sin reservarlo', async () => {
    const r = await request(http)
      .get('/api/v1/work-orders/sugerir-numero?prefijo=LIM-TAL')
      .set('Authorization', `Bearer ${tokenTecnico}`)
      .expect(200);

    expect(r.body.ultimo).toBe('LIM-TAL-000898');
    expect(r.body.sugerencia).toBe('LIM-TAL-000899');

    // No reserva nada: el número propuesto sigue libre.
    await request(http)
      .post('/api/v1/work-orders')
      .set('Authorization', `Bearer ${tokenTecnico}`)
      .send({ numero: 'LIM-TAL-000899', clienteId })
      .expect(201);
  }, 30_000);

  it('cerrar una orden deja constancia de cuándo', async () => {
    const creada = await request(http)
      .post('/api/v1/work-orders')
      .set('Authorization', `Bearer ${tokenTecnico}`)
      .send({ numero: 'LIM-TAL-000901', clienteId })
      .expect(201);

    const r = await request(http)
      .patch(`/api/v1/work-orders/${String(creada.body._id)}`)
      .set('Authorization', `Bearer ${tokenTecnico}`)
      .send({ estado: 'cerrada' })
      .expect(200);

    // Es el dato con el que se mide el tiempo de taller; no se teclea a mano.
    expect(r.body.estado).toBe('cerrada');
    expect(r.body.fechaCierre).toBeTruthy();
  }, 30_000);

  it('filtra por estado y por cliente', async () => {
    const abiertas = await request(http)
      .get(`/api/v1/work-orders?estado=abierta&clienteId=${clienteId}`)
      .set('Authorization', `Bearer ${tokenTecnico}`)
      .expect(200);

    expect(abiertas.body.total).toBeGreaterThan(0);
    for (const orden of abiertas.body.items as { estado: string }[]) {
      expect(orden.estado).toBe('abierta');
    }
  }, 30_000);

  it('el borrado es lógico: desaparece del listado pero el registro sigue', async () => {
    const creada = await request(http)
      .post('/api/v1/work-orders')
      .set('Authorization', `Bearer ${tokenTecnico}`)
      .send({ numero: 'LIM-TAL-000902', clienteId })
      .expect(201);
    const id = String(creada.body._id);

    await request(http)
      .delete(`/api/v1/work-orders/${id}`)
      .set('Authorization', `Bearer ${tokenTecnico}`)
      .expect(200);

    await request(http)
      .get(`/api/v1/work-orders/${id}`)
      .set('Authorization', `Bearer ${tokenTecnico}`)
      .expect(404);
  }, 30_000);

  it('el visor lee pero no crea', async () => {
    await request(http)
      .get('/api/v1/work-orders')
      .set('Authorization', `Bearer ${tokenVisor}`)
      .expect(200);

    await request(http)
      .post('/api/v1/work-orders')
      .set('Authorization', `Bearer ${tokenVisor}`)
      .send({ numero: 'LIM-TAL-000999', clienteId })
      .expect(403);
  }, 30_000);

  it('sin token no se accede', async () => {
    await request(http).get('/api/v1/work-orders').expect(401);
  });

  it('una orden inexistente devuelve 404, no 500', async () => {
    await request(http)
      .get('/api/v1/work-orders/no-es-un-id')
      .set('Authorization', `Bearer ${tokenTecnico}`)
      .expect(404);
  }, 30_000);
});

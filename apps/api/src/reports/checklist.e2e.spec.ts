import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import mongoose from 'mongoose';
import { testUri } from '../test-setup/test-uri';
import { ProblemDetailsFilter } from '../common/filters/problem-details.filter';

/**
 * Inventario de desarmado dentro del informe (E2.7, decisión D4).
 *
 * Lo que se comprueba aquí es lo que hace que el inventario sirva de algo:
 *
 * · **El catálogo lo pone el servidor.** Del cliente solo llega lo encontrado.
 *   Si el wizard pudiera mandar los ítems, el inventario acabaría hablando de
 *   piezas que no están en el SER-T-FOR-002 — o perdiendo las que sí están.
 *
 * · **Dejarlo a medias bloquea la emisión.** Que falten piezas o estén
 *   averiadas no: es precisamente lo que el inventario documenta. Lo que no
 *   puede pasar es que el informe afirme menos de lo que aparenta.
 */
describe('Inventario de desarmado del informe', () => {
  let app: NestExpressApplication;
  let http: ReturnType<NestExpressApplication['getHttpServer']>;
  let tokenAdmin: string;
  let tokenTecnico: string;
  let clienteId: string;
  let modelo20V: string;

  const PASSWORD = 'ContrasenaDePrueba2026';
  const conToken = (token: string) => ({ Authorization: `Bearer ${token}` });

  const login = async (email: string): Promise<string> => {
    const r = await request(http).post('/api/v1/auth/login').send({ email, password: PASSWORD });
    return r.body.accessToken as string;
  };

  /** Informe con el motor resuelto y el bloque de inventario ya añadido. */
  const informeConInventario = async (numero: string) => {
    const creado = await request(http)
      .post('/api/v1/reports')
      .set(conToken(tokenTecnico))
      .send({
        numeroInforme: numero,
        cliente: { id: clienteId },
        equipo: { codigo: 'VQT-130', categoria: 'camion_minero' },
        motor: {
          serie: '5282011236',
          modelo: '20V4000C23',
          modeloId: modelo20V,
          cilindros: 20,
          apoyosBancada: 11,
          bancos: 2,
        },
      })
      .expect(201);

    const conBloque = await request(http)
      .post(`/api/v1/reports/${String(creado.body._id)}/bloques`)
      .set(conToken(tokenTecnico))
      .send({ clave: 'inventario-desarmado' })
      .expect(201);

    return {
      id: String(creado.body._id),
      bloqueId: (conBloque.body.bloques as { id: string }[]).at(-1)?.id as string,
    };
  };

  const guardarInventario = (
    id: string,
    bloqueId: string,
    cuerpo: Record<string, unknown>,
    token = tokenTecnico,
  ) =>
    request(http)
      .post(`/api/v1/reports/${id}/bloques/${bloqueId}/checklist`)
      .set(conToken(token))
      .send(cuerpo);

  const inventarioDe = (cuerpo: { bloques: { checklist?: unknown }[] }) =>
    cuerpo.bloques.find((b) => b.checklist)?.checklist as {
      clave: string;
      items: { clave: string; denominacion: string }[];
      capturado: { clave: string; estado: string; cantidad: number | null }[];
    };

  beforeAll(async () => {
    Object.assign(process.env, {
      NODE_ENV: 'test',
      PORT: '3000',
      LOG_LEVEL: 'error',
      MONGODB_URI: testUri('dps-checklist-test'),
      JWT_ACCESS_SECRET: 'a'.repeat(64),
      JWT_REFRESH_SECRET: 'b'.repeat(64),
      CORS_ORIGINS: 'https://dev-tallerdetroit.tecdidata.com',
      SEED_PASSWORD: PASSWORD,
    });

    const { seedUsers } = await import('../seeds/users.seed');
    await seedUsers(process.env['MONGODB_URI'] as string);
    const { seedTemplates } = await import('../seeds/templates.seed');
    await seedTemplates(process.env['MONGODB_URI'] as string);
    const { seedMeasurements } = await import('../seeds/measurements.seed');
    await seedMeasurements(process.env['MONGODB_URI'] as string);

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

    const cliente = await request(http)
      .post('/api/v1/masters/clients')
      .set(conToken(tokenAdmin))
      .send({ razonSocial: 'SOUTHERN PERU', nombreCorto: 'SPCC. TOQUEPALA' });
    clienteId = String(cliente.body._id);

    const modelos = await request(http)
      .get('/api/v1/masters/engine-models?q=20V4000C23')
      .set(conToken(tokenAdmin))
      .expect(200);
    modelo20V = String((modelos.body.items as { _id: string }[])[0]?._id);
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await mongoose.disconnect().catch(() => undefined);
  });

  describe('el catálogo lo pone el servidor', () => {
    it('una captura vacía trae el inventario completo del maestro', async () => {
      const { id, bloqueId } = await informeConInventario('ITS-T-E-26-004-1001');

      const r = await guardarInventario(id, bloqueId, { capturado: [] }).expect(201);

      const inventario = inventarioDe(r.body);
      expect(inventario.clave).toBe('desarmado_motor');
      expect(inventario.items.length).toBeGreaterThan(5);
      expect(inventario.items.map((i) => i.clave)).toContain('piston');
    }, 60_000);

    it('los ítems que mande el cliente se ignoran: el formato no lo decide él', async () => {
      const { id, bloqueId } = await informeConInventario('ITS-T-E-26-004-1002');

      const r = await guardarInventario(id, bloqueId, {
        capturado: [],
        items: [{ clave: 'inventada', denominacion: 'Pieza que no existe' }],
      }).expect(201);

      expect(inventarioDe(r.body).items.map((i) => i.clave)).not.toContain('inventada');
    }, 60_000);

    it('una pieza que no está en el catálogo no se registra', async () => {
      const { id, bloqueId } = await informeConInventario('ITS-T-E-26-004-1003');

      const r = await guardarInventario(id, bloqueId, {
        capturado: [
          { clave: 'piston', estado: 'ok', cantidad: 20 },
          { clave: 'no_existe', estado: 'ok', cantidad: 1 },
        ],
      }).expect(201);

      const claves = inventarioDe(r.body).capturado.map((c) => c.clave);
      expect(claves).toContain('piston');
      expect(claves).not.toContain('no_existe');
    }, 60_000);

    it('un estado inventado se descarta en vez de guardarse', async () => {
      const { id, bloqueId } = await informeConInventario('ITS-T-E-26-004-1004');

      const r = await guardarInventario(id, bloqueId, {
        capturado: [{ clave: 'piston', estado: 'conforme_mas_o_menos', cantidad: 20 }],
      }).expect(201);

      expect(inventarioDe(r.body).capturado).toHaveLength(0);
    }, 60_000);
  });

  describe('qué impide emitir', () => {
    /** Deja el informe listo salvo por el inventario. */
    const validacion = async (id: string) => {
      const r = await request(http)
        .get(`/api/v1/reports/${id}/validacion`)
        .set(conToken(tokenTecnico))
        .expect(200);
      return r.body as { emitible: boolean; faltan: { titulo: string }[] };
    };

    it('un inventario a medias se reclama, diciendo cuántos faltan', async () => {
      const { id, bloqueId } = await informeConInventario('ITS-T-E-26-004-1010');

      await guardarInventario(id, bloqueId, {
        capturado: [{ clave: 'piston', estado: 'ok', cantidad: 20 }],
      }).expect(201);

      const { faltan } = await validacion(id);
      expect(faltan.some((f) => /inventario de desarmado le faltan/i.test(f.titulo))).toBe(true);
    }, 60_000);

    it('que falten piezas no bloquea: es lo que el inventario documenta', async () => {
      const { id, bloqueId } = await informeConInventario('ITS-T-E-26-004-1011');

      const primero = await guardarInventario(id, bloqueId, { capturado: [] }).expect(201);
      const todos = inventarioDe(primero.body).items.map((i) => ({
        clave: i.clave,
        estado: i.clave === 'volante' ? 'falta' : 'ok',
      }));

      await guardarInventario(id, bloqueId, { capturado: todos }).expect(201);

      const { faltan } = await validacion(id);
      expect(faltan.some((f) => /inventario/i.test(f.titulo))).toBe(false);
    }, 60_000);

    it('un inventario que ni se empezó no reclama nada: no todo informe desarma', async () => {
      const { id, bloqueId } = await informeConInventario('ITS-T-E-26-004-1012');
      await guardarInventario(id, bloqueId, { capturado: [] }).expect(201);

      const { faltan } = await validacion(id);
      expect(faltan.some((f) => /inventario/i.test(f.titulo))).toBe(false);
    }, 60_000);
  });

  it('un bloque que no existe se rechaza con 404', async () => {
    const { id } = await informeConInventario('ITS-T-E-26-004-1020');
    await guardarInventario(id, 'bloque-que-no-existe', { capturado: [] }).expect(404);
  }, 60_000);
});

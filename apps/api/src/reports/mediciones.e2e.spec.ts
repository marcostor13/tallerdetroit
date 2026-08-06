import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import mongoose from 'mongoose';
import { claveDeCelda } from '@dps/shared';
import { testUri } from '../test-setup/test-uri';
import { ProblemDetailsFilter } from '../common/filters/problem-details.filter';

/**
 * Validación de mediciones en el backend (E2.4).
 *
 * Dos cosas se comprueban aquí y las dos son de fondo:
 *
 * · **El servidor manda.** Los estados y el veredicto los calcula él a partir
 *   de los valores en crudo. Si el cliente pudiera enviarlos, bastaría una
 *   petición hecha a mano para que un motor fuera de tolerancia quedara
 *   registrado como correcto.
 *
 * · **RN-03.** Un informe con valores fuera de tolerancia no se emite sin que
 *   alguien escriba por qué.
 */
describe('Mediciones del informe', () => {
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

  /** Informe con el motor resuelto y un bloque de trabajo listo. */
  const informeConBloque = async (numero: string, motor?: Record<string, unknown>) => {
    const creado = await request(http)
      .post('/api/v1/reports')
      .set(conToken(tokenTecnico))
      .send({
        numeroInforme: numero,
        cliente: { id: clienteId },
        equipo: { codigo: 'VQT-130', categoria: 'camion_minero' },
        motor: motor ?? {
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
      .send({
        clave: 'trabajos',
        titulo: 'MEDICIÓN DEL TÚNEL DE BANCADA',
        texto: 'Se mide el túnel de bancada apoyo por apoyo con micrómetro de interiores.',
      })
      .expect(201);

    return {
      id: String(creado.body._id),
      bloqueId: (conBloque.body.bloques as { id: string }[]).at(-1)?.id as string,
    };
  };

  const guardarGrilla = (
    id: string,
    bloqueId: string,
    cuerpo: Record<string, unknown>,
    token = tokenTecnico,
  ) =>
    request(http)
      .post(`/api/v1/reports/${id}/bloques/${bloqueId}/mediciones`)
      .set(conToken(token))
      .send(cuerpo);

  /** La primera grilla del informe, esté en el bloque que esté. */
  const grillaDe = (cuerpo: { bloques: { mediciones?: unknown[] }[] }) =>
    (cuerpo.bloques.find((b) => (b.mediciones ?? []).length > 0)?.mediciones ?? [])[0] as {
      plantilla: string;
      columnas: string[];
      valores: { fila: string; columna: string; valor: number | null; estado: string | null }[];
      especificacion: Record<string, unknown> | null;
      resumen: Record<string, number | string | null>;
      justificacion: string | null;
    };

  beforeAll(async () => {
    Object.assign(process.env, {
      NODE_ENV: 'test',
      PORT: '3000',
      LOG_LEVEL: 'error',
      MONGODB_URI: testUri('dps-mediciones-test'),
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

  describe('la grilla se resuelve desde el motor del informe', () => {
    it('el túnel de bancada de un 20V sale con 11 columnas', async () => {
      const { id, bloqueId } = await informeConBloque('ITS-T-E-26-003-1001');

      const r = await guardarGrilla(id, bloqueId, {
        plantilla: 'tunel_bancada',
        valores: { [claveDeCelda('a', '1')]: 171.01 },
      }).expect(201);

      const grilla = grillaDe(r.body);
      expect(grilla.columnas).toHaveLength(11);
      expect(grilla.resumen['esperadas']).toBe(33);
    }, 60_000);

    it('sin el motor resuelto se rechaza en vez de inventar columnas', async () => {
      const { id, bloqueId } = await informeConBloque('ITS-T-E-26-003-1002', { serie: 'X' });

      const r = await guardarGrilla(id, bloqueId, {
        plantilla: 'tunel_bancada',
        valores: {},
      }).expect(400);

      expect(r.body.detail).toMatch(/número de serie/i);
    }, 60_000);

    it('una plantilla que no existe se rechaza', async () => {
      const { id, bloqueId } = await informeConBloque('ITS-T-E-26-003-1003');
      const r = await guardarGrilla(id, bloqueId, {
        plantilla: 'inventada',
        valores: {},
      }).expect(400);
      expect(r.body.detail).toMatch(/No existe la plantilla/i);
    }, 60_000);
  });

  describe('el servidor es la fuente de verdad', () => {
    it('calcula los estados a partir de los valores', async () => {
      const { id, bloqueId } = await informeConBloque('ITS-T-E-26-003-1010');

      const r = await guardarGrilla(id, bloqueId, {
        plantilla: 'tunel_bancada',
        valores: {
          [claveDeCelda('a', '1')]: 171.01,
          [claveDeCelda('a', '2')]: 171.024,
          [claveDeCelda('a', '3')]: 171.04,
        },
      }).expect(201);

      const valores = grillaDe(r.body).valores;
      const estado = (col: string) =>
        valores.find((v) => v.fila === 'a' && v.columna === col)?.estado;

      expect(estado('1')).toBe('ok');
      expect(estado('2')).toBe('alerta');
      expect(estado('3')).toBe('fuera');
    }, 60_000);

    it('descarta cualquier estado que llegue del cliente', async () => {
      const { id, bloqueId } = await informeConBloque('ITS-T-E-26-003-1011');

      // Un cliente malicioso podría marcar como correcto un valor que no lo es.
      const r = await guardarGrilla(id, bloqueId, {
        plantilla: 'tunel_bancada',
        valores: { [claveDeCelda('a', '1')]: 171.04 },
        estados: { [claveDeCelda('a', '1')]: 'ok' },
      }).expect(201);

      const celda = grillaDe(r.body).valores.find((v) => v.columna === '1' && v.fila === 'a');
      expect(celda?.estado).toBe('fuera');
    }, 60_000);

    it('la ovalidad la calcula el servidor y queda marcada', async () => {
      const { id, bloqueId } = await informeConBloque('ITS-T-E-26-003-1012');

      const r = await guardarGrilla(id, bloqueId, {
        plantilla: 'tunel_bancada',
        valores: {
          [claveDeCelda('a', '1')]: 171.0,
          [claveDeCelda('b1', '1')]: 171.02,
        },
      }).expect(201);

      const ovalidad = grillaDe(r.body).valores.find(
        (v) => v.fila === 'Ovalidad' && v.columna === '1',
      );
      expect(ovalidad?.valor).toBeCloseTo(0.02, 5);
    }, 60_000);

    it('propone el veredicto del bloque', async () => {
      const { id, bloqueId } = await informeConBloque('ITS-T-E-26-003-1013');

      const r = await guardarGrilla(id, bloqueId, {
        plantilla: 'tunel_bancada',
        valores: { [claveDeCelda('a', '1')]: 171.04 },
      }).expect(201);

      expect(grillaDe(r.body).resumen['veredicto']).toBe('cambiar');
    }, 60_000);
  });

  describe('la tolerancia se congela (§12.4.3)', () => {
    it('la grilla guarda el nominal y las tolerancias vigentes', async () => {
      const { id, bloqueId } = await informeConBloque('ITS-T-E-26-003-1020');

      const r = await guardarGrilla(id, bloqueId, {
        plantilla: 'tunel_bancada',
        valores: { [claveDeCelda('a', '1')]: 171.01 },
      }).expect(201);

      const spec = grillaDe(r.body).especificacion;
      expect(spec).toMatchObject({
        nominal: 171.0,
        tolInf: 0,
        tolSup: 0.025,
        unidad: 'mm',
        fuente: 'Informe OT898',
        // Se guarda que estaba sin validar: quien lea el informe dentro de dos
        // años tiene que poder saberlo.
        provisional: true,
      });
    }, 60_000);

    it('corregir la especificación no cambia un informe ya capturado', async () => {
      const { id, bloqueId } = await informeConBloque('ITS-T-E-26-003-1021');

      await guardarGrilla(id, bloqueId, {
        plantilla: 'tunel_bancada',
        valores: { [claveDeCelda('a', '1')]: 171.01 },
      }).expect(201);

      // Jefatura técnica contrasta con el manual y aprieta la tolerancia.
      const specs = await request(http)
        .get(`/api/v1/masters/engine-specs?engineModelId=${modelo20V}&limit=50`)
        .set(conToken(tokenAdmin))
        .expect(200);
      const tunel = (specs.body.items as { _id: string; parametro: string }[]).find(
        (s) => s.parametro === 'taladro_tunel_bancada',
      );

      await request(http)
        .patch(`/api/v1/masters/engine-specs/${String(tunel?._id)}`)
        .set(conToken(tokenAdmin))
        .send({ tolSup: 0.005, provisional: false, fuente: 'Manual MTU S4000' })
        .expect(200);

      const informe = await request(http)
        .get(`/api/v1/reports/${id}`)
        .set(conToken(tokenTecnico))
        .expect(200);

      // El informe conserva el criterio con el que fue evaluado. Uno firmado
      // que cambia de veredicto retroactivamente no vale nada.
      const spec = grillaDe(informe.body).especificacion;
      expect(spec?.['tolSup']).toBe(0.025);
      expect(spec?.['fuente']).toBe('Informe OT898');

      // Se deja como estaba: los demás tests miden contra la tolerancia
      // sembrada, y dejarla apretada los haría fallar por contaminación.
      await request(http)
        .patch(`/api/v1/masters/engine-specs/${String(tunel?._id)}`)
        .set(conToken(tokenAdmin))
        .send({ tolSup: 0.025, provisional: true, fuente: 'Informe OT898' })
        .expect(200);
    }, 90_000);

    it('sin especificación cargada se captura igual, pero sin evaluar', async () => {
      const { id, bloqueId } = await informeConBloque('ITS-T-E-26-003-1022');

      // `muñon_bancada` no tiene tolerancia cargada: D1 sigue abierta.
      const r = await guardarGrilla(id, bloqueId, {
        plantilla: 'muñon_bancada',
        valores: { [claveDeCelda('Ø', '1')]: 999 },
      }).expect(201);

      const grilla = grillaDe(r.body);
      expect(grilla.especificacion).toBeNull();
      expect(grilla.valores.find((v) => v.columna === '1')?.estado).toBeNull();
      expect(grilla.resumen['veredicto']).toBeNull();
      expect(grilla.resumen['capturadas']).toBe(1);
    }, 60_000);
  });

  describe('RN-03: fuera de tolerancia exige justificación', () => {
    const informeCompleto = async (numero: string) => {
      const { id, bloqueId } = await informeConBloque(numero);

      // Los obligatorios de SER-FOR-002 para que solo falte lo de mediciones.
      for (const bloque of [
        { clave: 'identificacion', datos: { numeroInforme: numero } },
        { clave: 'participantes', datos: { elaboradoPor: ['R. CÁCERES'] } },
        { clave: 'equipo-motor', datos: { serie: '5282011236' } },
        { clave: 'servicio', datos: { horasTotales: 17694 } },
        { clave: 'antecedentes', texto: 'Motor desmontado para evaluación.' },
        { clave: 'conclusiones', datos: ['Requiere reparación mayor.'] },
        { clave: 'recomendaciones', datos: ['Rectificar el túnel de bancada.'] },
      ]) {
        await request(http)
          .post(`/api/v1/reports/${id}/bloques`)
          .set(conToken(tokenTecnico))
          .send(bloque)
          .expect(201);
      }

      return { id, bloqueId };
    };

    /** Las 33 celdas del túnel, con una fuera de tolerancia si se pide. */
    const treintaYTres = (conUnaFuera: boolean) => {
      const valores: Record<string, number> = {};
      for (const fila of ['a', 'b1', 'b2']) {
        for (let c = 1; c <= 11; c++) {
          valores[claveDeCelda(fila, String(c))] =
            conUnaFuera && fila === 'a' && c === 5 ? 171.04 : 171.01;
        }
      }
      return valores;
    };

    it('con un valor fuera y sin justificar, no se emite', async () => {
      const { id, bloqueId } = await informeCompleto('ITS-T-E-26-003-1030');
      await guardarGrilla(id, bloqueId, {
        plantilla: 'tunel_bancada',
        valores: treintaYTres(true),
      }).expect(201);

      const validacion = await request(http)
        .get(`/api/v1/reports/${id}/validacion`)
        .set(conToken(tokenTecnico))
        .expect(200);

      expect(validacion.body.emitible).toBe(false);
      const aviso = (validacion.body.faltan as { titulo: string }[]).find((f) =>
        /fuera de\s+tolerancia/i.test(f.titulo),
      );
      expect(aviso).toBeTruthy();
      expect(aviso?.titulo).toMatch(/justificación del supervisor/i);

      await request(http)
        .post(`/api/v1/reports/${id}/estado`)
        .set(conToken(tokenAdmin))
        .send({ estado: 'emitido' })
        .expect(400);
    }, 120_000);

    it('con la justificación escrita, se emite y queda registrada', async () => {
      const { id, bloqueId } = await informeCompleto('ITS-T-E-26-003-1031');
      await guardarGrilla(id, bloqueId, {
        plantilla: 'tunel_bancada',
        valores: treintaYTres(true),
      }).expect(201);

      await guardarGrilla(id, bloqueId, {
        plantilla: 'tunel_bancada',
        valores: treintaYTres(true),
        justificacion:
          'El apoyo 5 excede en 0.015 mm. Se envía a rectificado externo antes del montaje.',
      }).expect(201);

      const validacion = await request(http)
        .get(`/api/v1/reports/${id}/validacion`)
        .set(conToken(tokenTecnico))
        .expect(200);
      expect(validacion.body.emitible).toBe(true);

      const emitido = await request(http)
        .post(`/api/v1/reports/${id}/estado`)
        .set(conToken(tokenAdmin))
        .send({ estado: 'emitido' })
        .expect(201);

      // Queda quién la escribió: el motor puede estar fuera de rango y ser
      // aceptable, pero eso lo decide una persona y consta.
      const grilla = grillaDe(emitido.body);
      expect(grilla.justificacion).toMatch(/rectificado externo/);
      expect(emitido.body.bloques.at(-1)).toBeTruthy();
    }, 120_000);

    it('todo dentro de tolerancia no pide justificación', async () => {
      const { id, bloqueId } = await informeCompleto('ITS-T-E-26-003-1032');
      await guardarGrilla(id, bloqueId, {
        plantilla: 'tunel_bancada',
        valores: treintaYTres(false),
      }).expect(201);

      const validacion = await request(http)
        .get(`/api/v1/reports/${id}/validacion`)
        .set(conToken(tokenTecnico))
        .expect(200);
      expect(validacion.body.emitible).toBe(true);
    }, 120_000);

    it('una grilla a medias avisa antes de emitir', async () => {
      const { id, bloqueId } = await informeCompleto('ITS-T-E-26-003-1033');
      await guardarGrilla(id, bloqueId, {
        plantilla: 'tunel_bancada',
        valores: { [claveDeCelda('a', '1')]: 171.01 },
      }).expect(201);

      const validacion = await request(http)
        .get(`/api/v1/reports/${id}/validacion`)
        .set(conToken(tokenTecnico))
        .expect(200);

      // Una grilla con 1 de 33 dice mucho menos de lo que el informe aparenta.
      const aviso = (validacion.body.faltan as { titulo: string }[]).find((f) =>
        /faltan 32 mediciones/i.test(f.titulo),
      );
      expect(aviso).toBeTruthy();
    }, 120_000);

    it('una grilla que ni se empezó no bloquea: no evaluar es una decisión válida', async () => {
      const { id } = await informeCompleto('ITS-T-E-26-003-1034');

      const validacion = await request(http)
        .get(`/api/v1/reports/${id}/validacion`)
        .set(conToken(tokenTecnico))
        .expect(200);
      expect(validacion.body.emitible).toBe(true);
    }, 120_000);
  });

  it('un informe emitido no admite más mediciones', async () => {
    const { id, bloqueId } = await informeConBloque('ITS-T-E-26-003-1040');
    await guardarGrilla(id, bloqueId, {
      plantilla: 'tunel_bancada',
      valores: { [claveDeCelda('a', '1')]: 171.01 },
    }).expect(201);

    const conexion = app.get<mongoose.Connection>(
      (await import('@nestjs/mongoose')).getConnectionToken(),
    );
    await conexion
      .collection('reports')
      .updateOne({ numeroInforme: 'ITS-T-E-26-003-1040' }, { $set: { estado: 'emitido' } });

    const r = await guardarGrilla(id, bloqueId, {
      plantilla: 'tunel_bancada',
      valores: { [claveDeCelda('a', '2')]: 171.02 },
    }).expect(403);
    expect(r.body.detail).toMatch(/ya no se puede editar/i);
  }, 60_000);

  it('guardar dos veces la misma plantilla la reemplaza, no la duplica', async () => {
    const { id, bloqueId } = await informeConBloque('ITS-T-E-26-003-1041');

    await guardarGrilla(id, bloqueId, {
      plantilla: 'tunel_bancada',
      valores: { [claveDeCelda('a', '1')]: 171.01 },
    }).expect(201);

    const r = await guardarGrilla(id, bloqueId, {
      plantilla: 'tunel_bancada',
      valores: { [claveDeCelda('a', '1')]: 171.02 },
    }).expect(201);

    const mediciones = (r.body.bloques as { mediciones?: unknown[] }[]).at(-1)?.mediciones ?? [];
    expect(mediciones).toHaveLength(1);
  }, 60_000);
});

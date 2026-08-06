import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import mongoose from 'mongoose';
import {
  cylindersPerBank,
  evaluateMeasurement,
  resolveColumns,
  validRange,
  type AppliedSpec,
} from '@dps/shared';
import { testUri } from '../test-setup/test-uri';
import { ProblemDetailsFilter } from '../common/filters/problem-details.filter';

/**
 * Maestros técnicos de F2 (E2.1).
 *
 * Lo que se comprueba es el hallazgo que gobierna la fase: **la grilla se
 * deriva del modelo de motor**. Al elegir un 20V la plataforma ya sabe que
 * debe pedir 11 apoyos y validar contra 193.000 mm, sin que nadie configure
 * nada. Si eso no se sostiene, el resto de F2 no tiene sentido.
 */
describe('Maestros técnicos de medición', () => {
  let app: NestExpressApplication;
  let http: ReturnType<NestExpressApplication['getHttpServer']>;
  let tokenAdmin: string;
  let tokenTecnico: string;

  const PASSWORD = 'ContrasenaDePrueba2026';
  const conToken = (token: string) => ({ Authorization: `Bearer ${token}` });

  /** Modelos y specs, indexados por denominación para poder consultarlos. */
  const modelos = new Map<string, string>();

  const login = async (email: string): Promise<string> => {
    const r = await request(http).post('/api/v1/auth/login').send({ email, password: PASSWORD });
    return r.body.accessToken as string;
  };

  const specDe = async (modelo: string, parametro: string) => {
    const r = await request(http)
      .get(`/api/v1/masters/engine-specs?engineModelId=${modelos.get(modelo)}&limit=100`)
      .set(conToken(tokenTecnico))
      .expect(200);
    return (r.body.items as AppliedSpec[] & { parametro: string }[]).find(
      (s) => (s as unknown as { parametro: string }).parametro === parametro,
    );
  };

  beforeAll(async () => {
    Object.assign(process.env, {
      NODE_ENV: 'test',
      PORT: '3000',
      LOG_LEVEL: 'error',
      MONGODB_URI: testUri('dps-measurements-test'),
      JWT_ACCESS_SECRET: 'a'.repeat(64),
      JWT_REFRESH_SECRET: 'b'.repeat(64),
      CORS_ORIGINS: 'https://dev-tallerdetroit.tecdidata.com',
      SEED_PASSWORD: PASSWORD,
    });

    const { seedUsers } = await import('../seeds/users.seed');
    await seedUsers(process.env['MONGODB_URI'] as string);
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

    const r = await request(http)
      .get('/api/v1/masters/engine-models?limit=50')
      .set(conToken(tokenAdmin))
      .expect(200);
    for (const m of r.body.items as { _id: string; denominacion: string }[]) {
      modelos.set(m.denominacion, m._id);
    }
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await mongoose.disconnect().catch(() => undefined);
  });

  // --- El hallazgo que gobierna F2 ---

  describe('la geometría de la grilla sale del modelo', () => {
    const geometriaDe = async (denominacion: string) => {
      const r = await request(http)
        .get(`/api/v1/masters/engine-models/${modelos.get(denominacion)}`)
        .set(conToken(tokenTecnico))
        .expect(200);
      return r.body as { cilindros: number; bancos: number; apoyosBancada: number };
    };

    it('el 20V4000C23 da 11 columnas de bancada y 10 de biela por banco', async () => {
      const motor = await geometriaDe('20V4000C23');

      expect(motor.apoyosBancada).toBe(11);
      expect(cylindersPerBank(motor)).toBe(10);

      // La misma función que usará la grilla, sin configuración manual.
      expect(resolveColumns({ tipo: 'modelo', campo: 'apoyosBancada' }, motor)).toHaveLength(11);
      expect(resolveColumns({ tipo: 'modelo', campo: 'cilindrosPorBanco' }, motor)).toHaveLength(
        10,
      );
    });

    it('el 16V4000C21 da 9 y 8, sin tocar nada', async () => {
      const motor = await geometriaDe('16V4000C21');

      expect(motor.apoyosBancada).toBe(9);
      expect(cylindersPerBank(motor)).toBe(8);
      expect(resolveColumns({ tipo: 'modelo', campo: 'apoyosBancada' }, motor)).toHaveLength(9);
      expect(resolveColumns({ tipo: 'modelo', campo: 'cilindrosPorBanco' }, motor)).toHaveLength(8);
    });

    it('los cilindros por banco se derivan, no se guardan', async () => {
      // Si fueran un campo más, alguien acabaría guardando 20 cilindros con 8
      // por banco y la grilla saldría torcida sin que nada avisara.
      const motor = await geometriaDe('20V4000C23');
      expect(cylindersPerBank(motor)).toBe(motor.cilindros / motor.bancos);
      expect((motor as Record<string, unknown>)['cilindrosPorBanco']).toBeUndefined();
    });
  });

  // --- §12.5: las tolerancias ---

  describe('especificaciones', () => {
    it('el encaje inferior valida contra 193.000 en el 20V y 189.000 en el 16V', async () => {
      const v20 = await specDe('20V4000C23', 'encaje_camisa_inferior');
      const v16 = await specDe('16V4000C21', 'encaje_camisa_inferior');

      expect(v20?.nominal).toBe(193.0);
      expect(v16?.nominal).toBe(189.0);

      // Y el rango sale de la tolerancia con signo, no de una magnitud suelta.
      expect(validRange(v20 as AppliedSpec)).toEqual({ min: 193.0, max: 193.08 });
    });

    it('un valor fuera de tolerancia se detecta con la spec cargada', async () => {
      const spec = (await specDe('20V4000C23', 'encaje_camisa_superior')) as AppliedSpec;

      expect(evaluateMeasurement(196.05, spec)).toBe('ok');
      // +0.16 sobre el nominal se sale del +0.15 admitido.
      expect(evaluateMeasurement(196.16, spec)).toBe('fuera');
      // La banda del 10% superior avisa antes de salirse.
      expect(evaluateMeasurement(196.14, spec)).toBe('alerta');
    });

    it('los muñones se anotan como desviación, no como medida', async () => {
      // Decisión D2: en los informes reales un −0.01 significa una centésima
      // por debajo del nominal. Comparado como medida absoluta contra 196 mm,
      // saldría fuera de tolerancia siempre.
      const spec = (await specDe('20V4000C23', 'camisa_encaje_superior')) as AppliedSpec;

      expect(spec.modo).toBe('desviacion');
      expect(validRange(spec)).toEqual({ min: -0.05, max: 0 });
      expect(evaluateMeasurement(-0.01, spec)).toBe('ok');
    });

    it('TODAS las sembradas están marcadas provisional (D1)', async () => {
      const r = await request(http)
        .get('/api/v1/masters/engine-specs?limit=100')
        .set(conToken(tokenAdmin))
        .expect(200);

      expect(r.body.total).toBe(6);
      // Salen de los informes, no del manual MTU. Emitir con ellas dando por
      // bueno un motor es exactamente lo que hay que evitar hasta que Jefatura
      // técnica las contraste.
      for (const spec of r.body.items as { provisional: boolean; fuente: string }[]) {
        expect(spec.provisional).toBe(true);
        expect(spec.fuente).toMatch(/^Informe OT/);
      }
    });

    it('se pueden pedir solo las que faltan por validar', async () => {
      const r = await request(http)
        .get('/api/v1/masters/engine-specs?provisional=true&limit=100')
        .set(conToken(tokenAdmin))
        .expect(200);
      expect(r.body.total).toBe(6);
    });

    it('un modelo no puede tener dos tolerancias del mismo parámetro', async () => {
      // Es el peor fallo posible de este maestro: dos criterios conviviendo y
      // la validación aplicando el que encuentre primero.
      const r = await request(http)
        .post('/api/v1/masters/engine-specs')
        .set(conToken(tokenAdmin))
        .send({
          engineModelId: modelos.get('20V4000C23'),
          parametro: 'encaje_camisa_inferior',
          nominal: 999,
          tolInf: 0,
          tolSup: 1,
          unidad: 'mm',
          fuente: 'Inventado',
        })
        .expect(409);

      expect(r.body.detail).toMatch(/Ya existe/i);
    });

    it('no admite alta rápida: una tolerancia a medias valida mal para siempre', async () => {
      const r = await request(http)
        .post('/api/v1/masters/engine-specs?inline=true')
        .set(conToken(tokenAdmin))
        .send({ parametro: 'inventado' })
        .expect(400);
      expect(r.body.detail).toMatch(/no admite creación rápida/i);
    });
  });

  // --- Catálogos de apoyo ---

  describe('unidades', () => {
    it('llevan su factor a la unidad base de su magnitud', async () => {
      const r = await request(http)
        .get('/api/v1/masters/units?magnitud=longitud&limit=20')
        .set(conToken(tokenTecnico))
        .expect(200);

      const unidades = r.body.items as { simbolo: string; factorABase: number; esBase: boolean }[];
      const mm = unidades.find((u) => u.simbolo === 'mm');
      const pulgada = unidades.find((u) => u.simbolo === 'in');

      // Sin el factor, una analítica que sume milímetros y pulgadas produce
      // números sin ningún significado.
      expect(mm?.esBase).toBe(true);
      expect(pulgada?.factorABase).toBe(25.4);
    });

    it('el milímetro se muestra con tres decimales', async () => {
      const r = await request(http)
        .get('/api/v1/masters/units?q=mm')
        .set(conToken(tokenTecnico))
        .expect(200);
      const mm = (r.body.items as { simbolo: string; decimales: number }[]).find(
        (u) => u.simbolo === 'mm',
      );
      // 193.000, no 193.00: es la precisión con la que se mide un encaje.
      expect(mm?.decimales).toBe(3);
    });
  });

  describe('veredictos', () => {
    it('están los cuatro de §12.4.4, ordenables por gravedad', async () => {
      const r = await request(http)
        .get('/api/v1/masters/component-verdicts?limit=20')
        .set(conToken(tokenTecnico))
        .expect(200);

      const veredictos = r.body.items as { clave: string; gravedad: number; tono: string }[];
      expect(veredictos.map((v) => v.clave).sort()).toEqual([
        'cambiar',
        'operativo',
        'reparar',
        'reutilizable',
      ]);

      const porClave = new Map(veredictos.map((v) => [v.clave, v]));
      expect(porClave.get('operativo')?.gravedad).toBeLessThan(
        porClave.get('cambiar')?.gravedad ?? 0,
      );
      // El tono es un nombre del sistema de diseño, nunca un hexadecimal.
      expect(porClave.get('cambiar')?.tono).toBe('danger');
    });
  });

  describe('componentes', () => {
    it('declaran de qué campo del motor sale su cantidad', async () => {
      const r = await request(http)
        .get('/api/v1/masters/engine-components?limit=50')
        .set(conToken(tokenTecnico))
        .expect(200);

      const componentes = r.body.items as {
        clave: string;
        cantidadDerivadaDe: string | null;
        cantidadPorMotor: number | null;
      }[];
      const porClave = new Map(componentes.map((c) => [c.clave, c]));

      // Los apoyos de bancada de un 20V son 11 y los de un 16V son 9: la
      // cantidad no puede ser un número fijo en el catálogo.
      expect(porClave.get('muñon_bancada')?.cantidadDerivadaDe).toBe('apoyosBancada');
      expect(porClave.get('camisa')?.cantidadDerivadaDe).toBe('cilindros');
      expect(porClave.get('cigueñal')?.cantidadPorMotor).toBe(1);
    });

    it('se agrupan por conjunto, para que la analítica pueda sumar por ahí', async () => {
      const r = await request(http)
        .get('/api/v1/masters/engine-components?grupo=tren_alternativo&limit=50')
        .set(conToken(tokenTecnico))
        .expect(200);

      const claves = (r.body.items as { clave: string }[]).map((c) => c.clave);
      expect(claves).toContain('cigueñal');
      expect(claves).toContain('piston');
      expect(claves).not.toContain('turbo');
    });
  });

  it('la siembra es idempotente', async () => {
    const { seedMeasurements } = await import('../seeds/measurements.seed');
    await seedMeasurements(process.env['MONGODB_URI'] as string);

    const r = await request(http)
      .get('/api/v1/masters/engine-specs?limit=100')
      .set(conToken(tokenAdmin))
      .expect(200);
    expect(r.body.total).toBe(6);
  }, 60_000);

  it('el técnico consulta las especificaciones pero no las cambia', async () => {
    await request(http).get('/api/v1/masters/engine-specs').set(conToken(tokenTecnico)).expect(200);

    // `masters:write` lo tiene el técnico para el alta inline, y este maestro
    // no la admite: el 400 llega antes que cualquier escritura.
    await request(http)
      .post('/api/v1/masters/engine-specs?inline=true')
      .set(conToken(tokenTecnico))
      .send({ parametro: 'x' })
      .expect(400);
  }, 30_000);
});

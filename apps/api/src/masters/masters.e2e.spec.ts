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
  /** Salto de linea de los CSV de prueba. */
  const BARRA_N = String.fromCharCode(10);

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

  // --- §13.2: carga masiva ---

  it('importa un CSV exportado de Excel en español, con punto y coma y comillas', async () => {
    const csv = [
      'nombre;ciudad;tipo',
      'MINA - CUAJONE;MOQUEGUA;mina',
      '"TALLER CENTRAL, SEDE 2";LIMA;taller',
    ].join(BARRA_N);

    const r = await request(http)
      .post('/api/v1/masters/sites/importar')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ csv })
      .expect(201);

    expect(r.body.creados).toBe(2);
    expect(r.body.errores).toEqual([]);

    // La coma dentro de comillas no partió el nombre: sin eso, este registro
    // habría entrado como «TALLER CENTRAL» con la ciudad desplazada.
    const lista = await request(http)
      .get('/api/v1/masters/sites?q=TALLER CENTRAL')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);
    expect(lista.body.items[0]?.nombre).toBe('TALLER CENTRAL, SEDE 2');
  }, 60_000);

  it('una fila mala no tumba el archivo: se importa el resto y se dice cuál falló', async () => {
    // Si 4.000 filas se rechazan por una, nadie repite la carga: se vuelve al
    // Excel y el maestro se queda vacío.
    const csv = ['nombre;ciudad', 'SEDE BUENA;LIMA', ';SIN NOMBRE', 'OTRA BUENA;AREQUIPA'].join(
      BARRA_N,
    );

    const r = await request(http)
      .post('/api/v1/masters/sites/importar')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ csv })
      .expect(201);

    expect(r.body.creados).toBe(2);
    expect(r.body.errores).toHaveLength(1);
    // El número de línea es el del archivo: es lo que el usuario ve al abrirlo.
    expect(r.body.errores[0].linea).toBe(3);
    expect(r.body.errores[0].motivo).toMatch(/nombre/i);
  }, 60_000);

  it('la simulación comprueba el archivo sin escribir nada', async () => {
    const csv = `nombre;ciudad${BARRA_N}SEDE SIMULADA;LIMA`;

    const r = await request(http)
      .post('/api/v1/masters/sites/importar?simulacion=true')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ csv })
      .expect(201);

    expect(r.body.simulacion).toBe(true);
    expect(r.body.creados).toBe(1);

    // Nada llegó a la base: probar el mapeo de columnas no debe obligar a
    // limpiarla a mano después.
    const lista = await request(http)
      .get('/api/v1/masters/sites?q=SEDE SIMULADA')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);
    expect(lista.body.items).toHaveLength(0);
  }, 60_000);

  it('repetir la carga actualiza en vez de fallar por duplicado', async () => {
    // El negocio corrige su Excel y vuelve a subirlo varias veces.
    const primera = `nombre;ciudad${BARRA_N}SEDE REPETIDA;LIMA`;
    const segunda = `nombre;ciudad${BARRA_N}SEDE REPETIDA;CALLAO`;

    await request(http)
      .post('/api/v1/masters/sites/importar')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ csv: primera })
      .expect(201);

    const r = await request(http)
      .post('/api/v1/masters/sites/importar')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ csv: segunda })
      .expect(201);

    expect(r.body.creados).toBe(0);
    expect(r.body.actualizados).toBe(1);
  }, 60_000);

  it('rechaza un archivo vacío con un mensaje claro', async () => {
    const r = await request(http)
      .post('/api/v1/masters/sites/importar')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ csv: '' })
      .expect(400);
    expect(r.body.detail).toMatch(/ninguna fila/i);
  }, 30_000);

  it('el técnico no puede importar en masa', async () => {
    await request(http)
      .post('/api/v1/masters/sites/importar')
      .set('Authorization', `Bearer ${tokenTecnico}`)
      .send({ csv: `nombre${BARRA_N}X` })
      .expect(403);
  }, 30_000);

  // --- §13.3.5: fusión de duplicados ---

  it('fusiona dos clientes duplicados y reapunta lo que los referenciaba', async () => {
    // `TOQUEPALA` y `SPCC. TOQUEPALA` son el mismo cliente escrito de dos
    // formas; mientras convivan no hay analítica que valga.
    const duplicado = await request(http)
      .post('/api/v1/masters/clients')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ razonSocial: 'SOUTHERN PERU', nombreCorto: 'TOQUEPALA' })
      .expect(201);
    const sobrante = String(duplicado.body._id);

    const sede = await request(http)
      .post('/api/v1/masters/sites')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ nombre: 'SEDE DEL DUPLICADO', clienteId: sobrante })
      .expect(201);

    const r = await request(http)
      .post('/api/v1/masters/clients/fusionar')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ queda: clienteId, sobrante })
      .expect(201);

    expect(r.body.fusionado).toBe(true);
    expect(r.body.referenciasReapuntadas).toBeGreaterThanOrEqual(1);

    // La sede ahora cuelga del cliente que se queda.
    const reapuntada = await request(http)
      .get(`/api/v1/masters/sites/${String(sede.body._id)}`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);
    expect(String(reapuntada.body.clienteId)).toBe(clienteId);

    // El sobrante desaparece del listado pero sigue existiendo: los informes
    // emitidos guardan su identificador y tienen que poder resolverlo.
    const listado = await request(http)
      .get('/api/v1/masters/clients')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);
    expect(listado.body.items.map((c: { _id: string }) => c._id)).not.toContain(sobrante);

    const conBajas = await request(http)
      .get('/api/v1/masters/clients?incluirInactivos=true')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);
    const fusionado = (conBajas.body.items as { _id: string; fusionadoEn?: string }[]).find(
      (c) => c._id === sobrante,
    );
    expect(String(fusionado?.fusionadoEn)).toBe(clienteId);
  }, 90_000);

  it('no se fusiona un registro consigo mismo', async () => {
    const r = await request(http)
      .post('/api/v1/masters/clients/fusionar')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ queda: clienteId, sobrante: clienteId })
      .expect(400);
    expect(r.body.detail).toMatch(/consigo mismo/i);
  }, 30_000);

  /**
   * Delta para la caché del dispositivo (E4.2).
   *
   * Es lo que permite que un teléfono lleve los catálogos encima sin volver a
   * bajarlos enteros cada cuatro horas. Lo que más importa aquí no son las
   * altas: son las **bajas**. Un cliente que solo recibiera registros activos
   * seguiría ofreciendo para siempre una sede desactivada.
   */
  describe('sincronización delta', () => {
    it('sin corte manda el catálogo entero y con corte solo lo que cambió', async () => {
      const completo = await request(http)
        .get('/api/v1/masters/clients/delta')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(200);

      expect(completo.body.items.length).toBeGreaterThan(0);
      expect(completo.body.hasta).toBeTruthy();
      expect(completo.body.hayMas).toBe(false);

      // Desde el corte que devolvió el servidor no ha cambiado nada.
      const vacio = await request(http)
        .get('/api/v1/masters/clients/delta')
        .query({ desde: completo.body.hasta })
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(200);

      expect(vacio.body.items).toHaveLength(0);
    }, 30_000);

    it('una baja viaja en el delta, para que el dispositivo la pueda quitar', async () => {
      const antes = await request(http)
        .get('/api/v1/masters/clients/delta')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(200);

      const creado = await request(http)
        .post('/api/v1/masters/clients')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ razonSocial: 'MINERA EFIMERA S.A.', nombreCorto: 'EFIMERA', ruc: '20999999991' })
        .expect(201);

      await request(http)
        .delete(`/api/v1/masters/clients/${creado.body._id}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(200);

      const despues = await request(http)
        .get('/api/v1/masters/clients/delta')
        .query({ desde: antes.body.hasta })
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(200);

      const dadoDeBaja = (despues.body.items as { _id: string; deletedAt?: string }[]).find(
        (i) => i._id === creado.body._id,
      );

      // El listado normal ya no lo devuelve; el delta sí, con su marca de baja.
      expect(dadoDeBaja).toBeTruthy();
      expect(dadoDeBaja?.deletedAt).toBeTruthy();
    }, 30_000);

    it('un lote lleno avisa de que quedan más y no miente con el corte', async () => {
      // Decir «ya estás al día» cuando quedan cambios sin mandar los perdería
      // para siempre: el cliente guardaría un `hasta` posterior a lo que tiene.
      const r = await request(http)
        .get('/api/v1/masters/clients/delta')
        .query({ limit: 1 })
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(200);

      expect(r.body.items).toHaveLength(1);
      expect(r.body.hayMas).toBe(true);
      expect(r.body.hasta).toBe(new Date(r.body.items[0].updatedAt).toISOString());
    }, 30_000);

    it('una fecha inválida se rechaza en vez de mandar el catálogo entero', async () => {
      const r = await request(http)
        .get('/api/v1/masters/clients/delta')
        .query({ desde: 'ayer por la tarde' })
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(400);

      expect(r.body.detail).toMatch(/no es una fecha válida/i);
    }, 30_000);

    it('«delta» no se confunde con el id de un registro', async () => {
      // La ruta va declarada antes que `:collection/:id`; con el orden al revés
      // Nest resolvería esto como «el cliente con id delta» y daría 404.
      await request(http)
        .get('/api/v1/masters/sites/delta')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(200);
    }, 30_000);
  });

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

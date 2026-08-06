import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import mongoose from 'mongoose';
import { testUri } from '../test-setup/test-uri';
import { ProblemDetailsFilter } from '../common/filters/problem-details.filter';

/**
 * Informes contra una base real.
 *
 * Aquí se comprueban tres criterios de aceptación de F1 que no son opinables:
 * dos informes no pueden compartir número, al reordenar bloques la numeración
 * de figuras se recalcula, y enviar con errores devuelve la lista de lo que
 * falta con el paso al que hay que ir.
 */
describe('Informes', () => {
  let app: NestExpressApplication;
  let http: ReturnType<NestExpressApplication['getHttpServer']>;
  let tokenAdmin: string;
  let tokenTecnico: string;
  let tokenVisor: string;
  let clienteId: string;
  let informeId: string;

  const PASSWORD = 'ContrasenaDePrueba2026';
  const NUMERO = 'ITS-T-E-26-003-0746';

  const login = async (email: string): Promise<string> => {
    const r = await request(http).post('/api/v1/auth/login').send({ email, password: PASSWORD });
    return r.body.accessToken as string;
  };

  const conToken = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    Object.assign(process.env, {
      NODE_ENV: 'test',
      PORT: '3000',
      LOG_LEVEL: 'error',
      MONGODB_URI: testUri('dps-reports-test'),
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
    tokenTecnico = await login('rcaceres@detroitpower.pe');
    tokenVisor = await login('gerencia@detroitpower.pe');

    const cliente = await request(http)
      .post('/api/v1/masters/clients')
      .set(conToken(tokenAdmin))
      .send({ razonSocial: 'SOUTHERN PERU COPPER CORPORATION', nombreCorto: 'SPCC. TOQUEPALA' });
    clienteId = String(cliente.body._id);
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await mongoose.disconnect().catch(() => undefined);
  });

  it('crea un informe con la versión vigente de la plantilla', async () => {
    const r = await request(http)
      .post('/api/v1/reports')
      .set(conToken(tokenTecnico))
      .send({
        numeroInforme: NUMERO,
        numeroOt: 'LIM-TAL-000746',
        cliente: { id: clienteId, nombre: 'SPCC. TOQUEPALA' },
        equipo: { codigo: 'VQT-130', categoria: 'camion_minero' },
        motor: { serie: '5282011236', cilindros: 20 },
      })
      .expect(201);

    informeId = String(r.body._id);
    expect(r.body.estado).toBe('borrador');
    // No se pide la versión: se resuelve sola, para que el informe nazca con la
    // estructura vigente sin que el cliente tenga que saber cuál es.
    expect(r.body.templateCodigo).toBe('SER-FOR-002');
    expect(r.body.templateVersion).toBe('v01');
  }, 30_000);

  it('dos informes no pueden compartir número (RN-01)', async () => {
    const r = await request(http)
      .post('/api/v1/reports')
      .set(conToken(tokenTecnico))
      .send({ numeroInforme: NUMERO.toLowerCase(), cliente: { id: clienteId } })
      .expect(409);

    expect(r.body.detail).toMatch(/Ya existe un informe/);
    expect(r.body.detail).toContain(NUMERO);
  }, 30_000);

  // --- Autoguardado (NFR-02, UX-01) ---

  it('el autoguardado escribe solo lo que llega y devuelve cuándo lo hizo', async () => {
    const r = await request(http)
      .patch(`/api/v1/reports/${informeId}`)
      .set(conToken(tokenTecnico))
      .send({ datos: { horasTotales: 17694 } })
      .expect(200);

    // El indicador «Guardado hace X» del wizard sale de aquí.
    expect(r.body.guardadoEn).toBeTruthy();
    expect(r.body.informe.datos.horasTotales).toBe(17694);
    // Lo que no se envió sigue como estaba.
    expect(r.body.informe.equipo.codigo).toBe('VQT-130');
  }, 30_000);

  it('dos guardados de campos distintos del mismo paso no se pisan', async () => {
    // Es lo que pasa con dos pestañas abiertas, o con un autoguardado que sale
    // mientras el técnico sigue escribiendo en otro campo.
    await request(http)
      .patch(`/api/v1/reports/${informeId}`)
      .set(conToken(tokenTecnico))
      .send({ datos: { motivo: 'QL4 / W6-1' } })
      .expect(200);

    const r = await request(http)
      .get(`/api/v1/reports/${informeId}`)
      .set(conToken(tokenTecnico))
      .expect(200);

    expect(r.body.datos.horasTotales).toBe(17694);
    expect(r.body.datos.motivo).toBe('QL4 / W6-1');
  }, 30_000);

  it('el autoguardado no deja reescribir el estado ni la plantilla congelada', async () => {
    await request(http)
      .patch(`/api/v1/reports/${informeId}`)
      .set(conToken(tokenTecnico))
      .send({ estado: 'emitido', templateSnapshot: { falso: true } })
      .expect(200);

    const r = await request(http)
      .get(`/api/v1/reports/${informeId}`)
      .set(conToken(tokenTecnico))
      .expect(200);

    expect(r.body.estado).toBe('borrador');
    expect(r.body.templateSnapshot).toBeNull();
  }, 30_000);

  // --- Bloques y figuras (RN-06) ---

  it('añade bloques de trabajo, que la plantilla declara repetibles', async () => {
    for (const titulo of ['DESMONTAJE DE CULATAS', 'DESMONTAJE DE PISTONES']) {
      await request(http)
        .post(`/api/v1/reports/${informeId}/bloques`)
        .set(conToken(tokenTecnico))
        .send({ clave: 'trabajos', titulo, texto: `Se realiza el ${titulo.toLowerCase()}.` })
        .expect(201);
    }

    const r = await request(http)
      .get(`/api/v1/reports/${informeId}`)
      .set(conToken(tokenTecnico))
      .expect(200);

    expect(r.body.bloques).toHaveLength(2);
    expect(r.body.bloques.map((b: { orden: number }) => b.orden)).toEqual([1, 2]);
  }, 30_000);

  it('un bloque que no admite repetición no se duplica', async () => {
    await request(http)
      .post(`/api/v1/reports/${informeId}/bloques`)
      .set(conToken(tokenTecnico))
      .send({ clave: 'antecedentes', texto: 'Motor desmontado del camión VQT-130.' })
      .expect(201);

    const r = await request(http)
      .post(`/api/v1/reports/${informeId}/bloques`)
      .set(conToken(tokenTecnico))
      .send({ clave: 'antecedentes', texto: 'Otro más.' })
      .expect(409);

    expect(r.body.detail).toMatch(/no se puede repetir/i);
  }, 30_000);

  it('un bloque que la plantilla no declara no entra', async () => {
    const r = await request(http)
      .post(`/api/v1/reports/${informeId}/bloques`)
      .set(conToken(tokenTecnico))
      .send({ clave: 'inventado', texto: 'x' })
      .expect(400);
    expect(r.body.detail).toMatch(/no tiene ningún bloque/i);
  }, 30_000);

  it('al reordenar bloques, la numeración de figuras se recalcula (RN-06)', async () => {
    const informe = await request(http)
      .get(`/api/v1/reports/${informeId}`)
      .set(conToken(tokenTecnico))
      .expect(200);

    const bloques = informe.body.bloques as { id: string; titulo: string }[];
    const culatas = bloques.find((b) => b.titulo === 'DESMONTAJE DE CULATAS');
    const pistones = bloques.find((b) => b.titulo === 'DESMONTAJE DE PISTONES');
    if (!culatas || !pistones) throw new Error('No se crearon los bloques de trabajo.');

    for (const [bloque, fotos] of [
      [culatas, ['culata-1', 'culata-2']],
      [pistones, ['piston-1']],
    ] as [{ id: string }, string[]][]) {
      await request(http)
        .patch(`/api/v1/reports/${informeId}/bloques/${bloque.id}`)
        .set(conToken(tokenTecnico))
        .send({
          fotos: fotos.map((id) => ({ id, s3Key: `org/2026/${id}.jpg`, caption: `Pie de ${id}` })),
        })
        .expect(200);
    }

    const numeroDe = (cuerpo: { bloques: { fotos: { id: string; numeroFigura: number }[] }[] }) =>
      new Map(cuerpo.bloques.flatMap((b) => b.fotos.map((f) => [f.id, f.numeroFigura])));

    const antes = await request(http)
      .get(`/api/v1/reports/${informeId}`)
      .set(conToken(tokenTecnico))
      .expect(200);
    expect(numeroDe(antes.body).get('culata-1')).toBe(1);
    expect(numeroDe(antes.body).get('piston-1')).toBe(3);

    // Se mueve el bloque de pistones al principio. En el Word, aquí es donde el
    // texto empezaba a decir «ver Fig. 3» apuntando a otra foto.
    const posicion = (antes.body.bloques as { id: string }[]).findIndex(
      (b) => b.id === pistones.id,
    );
    const despues = await request(http)
      .post(`/api/v1/reports/${informeId}/bloques/reordenar`)
      .set(conToken(tokenTecnico))
      .send({ desde: posicion, hasta: 0 })
      .expect(201);

    expect(numeroDe(despues.body).get('piston-1')).toBe(1);
    expect(numeroDe(despues.body).get('culata-1')).toBe(2);
  }, 60_000);

  it('quitar un bloque renumera y deja los órdenes contiguos', async () => {
    const informe = await request(http)
      .get(`/api/v1/reports/${informeId}`)
      .set(conToken(tokenTecnico))
      .expect(200);

    const antecedentes = (informe.body.bloques as { id: string; clave: string }[]).find(
      (b) => b.clave === 'antecedentes',
    );
    if (!antecedentes) throw new Error('No existe el bloque de antecedentes.');

    const r = await request(http)
      .delete(`/api/v1/reports/${informeId}/bloques/${antecedentes.id}`)
      .set(conToken(tokenTecnico))
      .expect(200);

    expect(r.body.bloques.map((b: { orden: number }) => b.orden)).toEqual([1, 2]);
  }, 30_000);

  // --- Validación de emisión (UX-07) ---

  it('dice todo lo que falta, con el paso al que lleva cada punto', async () => {
    const r = await request(http)
      .get(`/api/v1/reports/${informeId}/validacion`)
      .set(conToken(tokenTecnico))
      .expect(200);

    expect(r.body.emitible).toBe(false);
    expect(r.body.faltan.length).toBeGreaterThan(0);
    // Lo que hace el aviso navegable por clic en vez de un «faltan datos».
    for (const falta of r.body.faltan as { paso: number; titulo: string; seccion: string }[]) {
      expect(falta.paso).toBeGreaterThanOrEqual(1);
      expect(falta.titulo).toBeTruthy();
      expect(falta.seccion).toBeTruthy();
    }
  }, 30_000);

  it('una foto sin pie cuenta como dato que falta', async () => {
    const informe = await request(http)
      .get(`/api/v1/reports/${informeId}`)
      .set(conToken(tokenTecnico))
      .expect(200);
    const bloque = (informe.body.bloques as { id: string }[])[0];
    if (!bloque) throw new Error('El informe no tiene bloques.');

    await request(http)
      .patch(`/api/v1/reports/${informeId}/bloques/${bloque.id}`)
      .set(conToken(tokenTecnico))
      .send({ fotos: [{ id: 'sin-pie', s3Key: 'org/2026/x.jpg', caption: '' }] })
      .expect(200);

    const r = await request(http)
      .get(`/api/v1/reports/${informeId}/validacion`)
      .set(conToken(tokenTecnico))
      .expect(200);

    expect((r.body.faltan as { titulo: string }[]).some((f) => /sin pie/i.test(f.titulo))).toBe(
      true,
    );
  }, 30_000);

  it('no se emite con datos incompletos, y el error trae la lista', async () => {
    const r = await request(http)
      .post(`/api/v1/reports/${informeId}/estado`)
      .set(conToken(tokenAdmin))
      .send({ estado: 'emitido' })
      .expect(400);

    expect(r.body.detail).toMatch(/Faltan \d+ datos obligatorios/);

    // El error trae la lista, no solo la frase: sin ella el frontend no puede
    // pintar los enlaces a cada campo que falta (UX-07) y tendría que volver a
    // preguntar.
    expect(Array.isArray(r.body.faltan)).toBe(true);
    expect(r.body.faltan.length).toBeGreaterThan(0);
    expect(r.body.faltan[0].paso).toBeGreaterThanOrEqual(1);
  }, 30_000);

  // --- Emisión e inmutabilidad ---

  it('un informe completo se emite y congela su plantilla (§11.1)', async () => {
    const completo = await request(http)
      .post('/api/v1/reports')
      .set(conToken(tokenTecnico))
      .send({
        numeroInforme: 'ITS-T-E-26-003-0899',
        cliente: { id: clienteId, nombre: 'SPCC. TOQUEPALA' },
        equipo: { codigo: 'VQT-131', categoria: 'camion_minero' },
        motor: { serie: '5272012973', cilindros: 16 },
      })
      .expect(201);
    const id = String(completo.body._id);

    // Los obligatorios de SER-FOR-002 v01, con contenido de verdad.
    const obligatorios = [
      { clave: 'identificacion', datos: { numeroInforme: 'ITS-T-E-26-003-0899' } },
      { clave: 'participantes', datos: { elaboradoPor: ['RONALD CÁCERES'] } },
      { clave: 'equipo-motor', datos: { serie: '5272012973' } },
      { clave: 'servicio', datos: { horasTotales: 12000 } },
      { clave: 'antecedentes', texto: 'Motor desmontado para evaluación.' },
      { clave: 'trabajos', titulo: 'DESMONTAJE DE CULATAS', texto: 'Se desmontan las culatas.' },
      { clave: 'conclusiones', datos: ['El motor requiere reparación mayor.'] },
      { clave: 'recomendaciones', datos: ['Cambiar los 16 pistones.'] },
    ];

    for (const bloque of obligatorios) {
      await request(http)
        .post(`/api/v1/reports/${id}/bloques`)
        .set(conToken(tokenTecnico))
        .send(bloque)
        .expect(201);
    }

    const validacion = await request(http)
      .get(`/api/v1/reports/${id}/validacion`)
      .set(conToken(tokenTecnico))
      .expect(200);
    expect(validacion.body.faltan).toEqual([]);
    expect(validacion.body.emitible).toBe(true);

    const emitido = await request(http)
      .post(`/api/v1/reports/${id}/estado`)
      .set(conToken(tokenAdmin))
      .send({ estado: 'emitido' })
      .expect(201);

    expect(emitido.body.estado).toBe('emitido');
    expect(emitido.body.fechaEmision).toBeTruthy();
    // A partir de aquí se renderiza igual para siempre, publique Calidad lo que
    // publique.
    expect(emitido.body.templateSnapshot.version).toBe('v01');
    expect(emitido.body.templateSnapshot.secciones).toHaveLength(11);
    expect(emitido.body.historialEstados[0].de).toBe('borrador');

    // RN-02: un informe emitido ya no se edita.
    const r = await request(http)
      .patch(`/api/v1/reports/${id}`)
      .set(conToken(tokenAdmin))
      .send({ datos: { motivo: 'cambiado' } })
      .expect(403);
    expect(r.body.detail).toMatch(/ya no se puede editar/i);

    await request(http).delete(`/api/v1/reports/${id}`).set(conToken(tokenAdmin)).expect(409);
  }, 120_000);

  it('cada transición exige su propio permiso, no uno genérico', async () => {
    // El técnico puede enviar a revisión pero no emitir: son permisos
    // distintos y el guard del controlador solo puede exigir uno fijo.
    const r = await request(http)
      .post(`/api/v1/reports/${informeId}/estado`)
      .set(conToken(tokenTecnico))
      .send({ estado: 'emitido' })
      .expect(403);

    expect(r.body.detail).toMatch(/reports:issue/);
  }, 30_000);

  it('una transición que la máquina de estados no contempla se rechaza', async () => {
    const r = await request(http)
      .post(`/api/v1/reports/${informeId}/estado`)
      .set(conToken(tokenAdmin))
      .send({ estado: 'aprobado' })
      .expect(409);
    expect(r.body.detail).toMatch(/no puede pasar/i);
  }, 30_000);

  it('anular exige un motivo', async () => {
    const r = await request(http)
      .post(`/api/v1/reports/${informeId}/estado`)
      .set(conToken(tokenAdmin))
      .send({ estado: 'anulado' })
      .expect(400);
    expect(r.body.detail).toMatch(/comentario/i);
  }, 30_000);

  // --- Bandeja y relación con la OT ---

  it('la bandeja no arrastra los bloques: son casi todo el peso del documento', async () => {
    const r = await request(http).get('/api/v1/reports').set(conToken(tokenTecnico)).expect(200);

    expect(r.body.total).toBeGreaterThanOrEqual(2);
    for (const informe of r.body.items as Record<string, unknown>[]) {
      expect(informe['bloques']).toBeUndefined();
      expect(informe['templateSnapshot']).toBeUndefined();
    }
  }, 30_000);

  it('busca por número de informe y por número de O/T', async () => {
    for (const consulta of ['0746', 'LIM-TAL-000746']) {
      const r = await request(http)
        .get(`/api/v1/reports?q=${encodeURIComponent(consulta)}`)
        .set(conToken(tokenTecnico))
        .expect(200);
      expect(r.body.total).toBeGreaterThanOrEqual(1);
    }
  }, 30_000);

  it('una orden de trabajo lista sus informes (relación 1..n de E1.3)', async () => {
    const orden = await request(http)
      .post('/api/v1/work-orders')
      .set(conToken(tokenTecnico))
      .send({ numero: 'LIM-TAL-000955', clienteId })
      .expect(201);
    const workOrderId = String(orden.body._id);

    for (const numero of ['ITS-T-E-26-003-0955', 'ITS-T-E-26-003-0956']) {
      await request(http)
        .post('/api/v1/reports')
        .set(conToken(tokenTecnico))
        .send({ numeroInforme: numero, workOrderId, cliente: { id: clienteId } })
        .expect(201);
    }

    const r = await request(http)
      .get(`/api/v1/reports/por-orden/${workOrderId}`)
      .set(conToken(tokenTecnico))
      .expect(200);

    expect(r.body.total).toBe(2);
  }, 60_000);

  // --- RBAC ---

  it('el visor lee pero no crea ni edita', async () => {
    await request(http).get('/api/v1/reports').set(conToken(tokenVisor)).expect(200);

    await request(http)
      .post('/api/v1/reports')
      .set(conToken(tokenVisor))
      .send({ numeroInforme: 'ITS-T-E-26-003-0777', cliente: { id: clienteId } })
      .expect(403);
  }, 30_000);

  it('sin token no se accede', async () => {
    await request(http).get('/api/v1/reports').expect(401);
  });

  it('un informe inexistente devuelve 404, no 500', async () => {
    await request(http).get('/api/v1/reports/no-es-un-id').set(conToken(tokenTecnico)).expect(404);
  }, 30_000);
});

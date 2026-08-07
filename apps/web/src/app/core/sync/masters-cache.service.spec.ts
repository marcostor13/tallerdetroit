import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MastersCacheService } from './masters-cache.service';
import { BASE_LOCAL } from './sync.db';
import { baseLocalFalsa, comoBaseLocal } from './testing/base-local.fake';
import { AuthService } from '../auth/auth.service';
import { ConnectionService } from '../connection/connection.service';
import { environment } from '../../../environments/environment';

const base = baseLocalFalsa();

/**
 * Caché de maestros en el dispositivo (E4.2).
 *
 * Lo que decide si el técnico encuentra su cliente en el socavón: que la
 * descarga sea delta y no un volcado, que las bajas se propaguen, y que buscar
 * sin red dé el mismo resultado que buscar con red.
 */
describe('MastersCacheService', () => {
  let servicio: MastersCacheService;
  let http: HttpTestingController;
  let conexion: ConnectionService;

  const delta = (coleccion: string) =>
    http.expectOne((r) => r.url === `${environment.apiUrl}/masters/${coleccion}/delta`);

  /** Contesta el delta de un maestro y deja quietos los demás. */
  const contestar = (coleccion: string, cuerpo: Record<string, unknown>) => {
    delta(coleccion).flush({
      coleccion,
      total: 0,
      items: [],
      hasta: 'x',
      hayMas: false,
      ...cuerpo,
    });
  };

  const asentar = async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  };

  /**
   * Contesta vacío a todo lo que quede en vuelo.
   *
   * `sincronizar` recorre los doce maestros en cadena, así que sin esto la
   * siguiente llamada se encontraría la anterior a medias y no haría nada.
   */
  const drenar = async () => {
    // Se aguantan varias vueltas en vacío antes de dar por terminado: entre una
    // respuesta y la siguiente petición hay escrituras en la base local, y
    // rendirse en el primer hueco dejaría la cadena a medias — y con ella, la
    // siguiente llamada a `sincronizar` sin hacer nada por el guardia.
    let enVacio = 0;

    for (let vuelta = 0; vuelta < 200 && enVacio < 5; vuelta++) {
      const pendientes = http.match(() => true);
      enVacio = pendientes.length ? 0 : enVacio + 1;

      for (const p of pendientes) {
        p.flush({ items: [], hasta: '2026-06-20T12:00:00.000Z', hayMas: false });
      }
      await asentar();
    }
  };

  beforeEach(() => {
    base.vaciar();

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        MastersCacheService,
        ConnectionService,
        { provide: BASE_LOCAL, useValue: comoBaseLocal(base) },
        // La sesión se controla desde el test: el servicio se sincroniza solo
        // al autenticarse, y aquí interesa disparar eso a voluntad.
        { provide: AuthService, useValue: { isAuthenticated: () => false } },
      ],
    });

    servicio = TestBed.inject(MastersCacheService);
    http = TestBed.inject(HttpTestingController);
    conexion = TestBed.inject(ConnectionService);
    conexion.online.set(true);
  });

  describe('la descarga', () => {
    it('la primera vez pide sin corte: no hay nada guardado', async () => {
      void servicio.sincronizar();
      await asentar();

      const peticion = delta('clients');
      expect(peticion.request.params.has('desde')).toBe(false);
      peticion.flush({ items: [], hasta: '2026-06-20T12:00:00.000Z', hayMas: false });
      await drenar();
    });

    it('la siguiente pide solo lo que cambió desde el `hasta` del servidor', async () => {
      // El corte viene del servidor y no del reloj del teléfono: uno desviado
      // unos minutos perdería para siempre los cambios de esa ventana.
      await base.maestrosEstado.put({
        coleccion: 'clients',
        sincronizadoHasta: '2026-01-01T00:00:00.000Z',
      });

      void servicio.sincronizar(true);
      await asentar();

      expect(delta('clients').request.params.get('desde')).toBe('2026-01-01T00:00:00.000Z');
    });

    it('guarda lo vigente y quita de la caché lo que se dio de baja', async () => {
      void servicio.sincronizar();
      await asentar();

      contestar('clients', {
        items: [
          { _id: 'c1', nombreCorto: 'SPCC. TOQUEPALA' },
          { _id: 'c2', nombreCorto: 'CERRO VERDE' },
        ],
        hasta: '2026-06-20T12:00:00.000Z',
      });
      await drenar();

      expect(base.maestros.filas.has('clients:c1')).toBe(true);
      expect(base.maestros.filas.has('clients:c2')).toBe(true);

      // Segunda vuelta: uno de ellos se desactiva.
      void servicio.sincronizar(true);
      await asentar();

      contestar('clients', {
        items: [{ _id: 'c2', nombreCorto: 'CERRO VERDE', activo: false }],
        hasta: '2026-06-20T16:00:00.000Z',
      });
      await drenar();

      // Sin esto seguiría ofreciéndose en el desplegable para siempre.
      expect(base.maestros.filas.has('clients:c2')).toBe(false);
      expect(base.maestros.filas.has('clients:c1')).toBe(true);
    });

    it('sigue pidiendo mientras el servidor diga que quedan más', async () => {
      // Un catálogo que nunca se sincronizó no cabe en una respuesta; quedarse
      // con el primer lote dejaría al técnico con medio catálogo sin saberlo.
      void servicio.sincronizar();
      await asentar();

      contestar('clients', {
        items: [{ _id: 'c1' }],
        hasta: '2026-06-20T10:00:00.000Z',
        hayMas: true,
      });
      await asentar();

      const segunda = delta('clients');
      expect(segunda.request.params.get('desde')).toBe('2026-06-20T10:00:00.000Z');
      segunda.flush({ items: [{ _id: 'c2' }], hasta: '2026-06-20T11:00:00.000Z', hayMas: false });
      await drenar();

      expect(base.maestros.filas.size).toBe(2);
    });

    it('sin conexión no se intenta nada', async () => {
      conexion.online.set(false);
      await servicio.sincronizar();

      http.expectNone(() => true);
    });

    it('un maestro que no venció su plazo no se vuelve a bajar', async () => {
      const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      await base.maestrosEstado.put({ coleccion: 'clients', sincronizadoHasta: haceUnaHora });

      void servicio.sincronizar();
      await asentar();

      // Abrir la app seis veces en una mañana no son seis descargas.
      http.expectNone((r) => r.url.includes('/masters/clients/delta'));
    });

    it('que falle un maestro no deja la caché a medias de los demás', async () => {
      void servicio.sincronizar();
      await asentar();

      delta('clients').error(new ProgressEvent('error'));
      await asentar();

      // La caché se queda como estaba: el técnico trabaja con lo de la última
      // vez, que es infinitamente mejor que una app bloqueada.
      expect(servicio.sincronizando()).toBe(false);
    });
  });

  describe('buscar sin red', () => {
    beforeEach(async () => {
      for (const [id, nombreCorto, razonSocial] of [
        ['c1', 'SPCC. TOQUEPALA', 'SOUTHERN PERU COPPER CORPORATION'],
        ['c2', 'KOMATSU MITSUI', 'KOMATSU MITSUI MAQUINARIAS PERU S.A.'],
        ['c3', 'ANTAMINA', 'COMPAÑIA MINERA ANTAMINA S.A.'],
      ]) {
        await base.maestros.put({
          clave: `clients:${id}`,
          coleccion: 'clients',
          registroId: id as string,
          datos: { _id: id, nombreCorto, razonSocial },
        });
      }

      for (const [id, nombre, clienteId] of [
        ['s1', 'TALLER AREQUIPA', 'c1'],
        ['s2', 'MINA TOQUEPALA', 'c1'],
        ['s3', 'TALLER LIMA', 'c2'],
      ]) {
        await base.maestros.put({
          clave: `sites:${id}`,
          coleccion: 'sites',
          registroId: id as string,
          datos: { _id: id, nombre, clienteId },
        });
      }
    });

    it('perdona la errata, igual que el servidor', async () => {
      // Se usa el mismo `fuzzySearch` de `libs/shared`. Con dos algoritmos
      // distintos, «KOMATZU» encontraría la marca en el taller y no en la mina:
      // una caché en la que no se puede confiar es peor que no tenerla.
      const { items } = await servicio.buscar('clients', { q: 'KOMATZU' });

      expect(items[0]?.['nombreCorto']).toBe('KOMATSU MITSUI');
    });

    it('respeta los filtros de cascada', async () => {
      // Buscar «TALLER» sin acotar por cliente devolvería la sede de otro.
      const { items } = await servicio.buscar('sites', {
        q: 'TALLER',
        filtros: { clienteId: 'c1' },
      });

      expect(items.map((i) => i['nombre'])).toEqual(['TALLER AREQUIPA']);
    });

    it('sin texto devuelve el catálogo acotado, para abrir el desplegable', async () => {
      const { items } = await servicio.buscar('sites', { filtros: { clienteId: 'c1' } });
      expect(items).toHaveLength(2);
    });

    it('un maestro que no se cachea devuelve vacío, no un error', async () => {
      // Los catálogos de administración no bajan al dispositivo a propósito.
      expect(await servicio.buscar('organizations', { q: 'x' })).toEqual({ total: 0, items: [] });
    });

    it('un registro concreto se recupera por su id', async () => {
      expect(await servicio.porId('clients', 'c1')).toMatchObject({
        nombreCorto: 'SPCC. TOQUEPALA',
      });
      expect(await servicio.porId('clients', 'noexiste')).toBeNull();
    });
  });

  it('la sincronización arranca sola al autenticarse', async () => {
    const autenticado = vi.fn().mockReturnValue(true);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        MastersCacheService,
        ConnectionService,
        { provide: BASE_LOCAL, useValue: comoBaseLocal(base) },
        { provide: AuthService, useValue: { isAuthenticated: autenticado } },
      ],
    });

    const otro = TestBed.inject(MastersCacheService);
    TestBed.inject(ConnectionService).online.set(true);
    TestBed.tick();
    await asentar();

    expect(otro.sincronizando()).toBe(true);
    TestBed.inject(HttpTestingController).expectOne(
      (r) => r.url === `${environment.apiUrl}/masters/clients/delta`,
    );
  });
});

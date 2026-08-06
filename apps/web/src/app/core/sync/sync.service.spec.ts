import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SyncService } from './sync.service';
import { ConnectionService } from '../connection/connection.service';
import { baseLocal } from './sync.db';
import type { OperacionOffline } from '@dps/shared';
import { environment } from '../../../environments/environment';

/**
 * Cola de sincronización del dispositivo (E4.4).
 *
 * IndexedDB se sustituye por un doble en memoria: lo que se prueba aquí es la
 * costura entre la cola y la API —qué se manda, en qué orden, y qué pasa cuando
 * la red falla—, no que Dexie sepa guardar. Que la operación sobreviva a un
 * cierre del navegador es cosa de Dexie y se comprueba con la app en la mano.
 */
describe('SyncService', () => {
  let servicio: SyncService;
  let http: HttpTestingController;
  let conexion: ConnectionService;

  /** Doble de la tabla de operaciones: un mapa y nada más. */
  const guardadas = new Map<string, unknown>();

  beforeEach(async () => {
    guardadas.clear();

    // Dexie devuelve su propio `PromiseExtended`, no una `Promise` a secas; los
    // dobles se castean porque lo que se prueba es qué se llama, no el tipo.
    vi.spyOn(baseLocal.operaciones, 'put').mockImplementation((async (op: OperacionOffline) => {
      guardadas.set(op.clientOpId, op);
      return op.clientOpId;
    }) as never);
    vi.spyOn(baseLocal.operaciones, 'toArray').mockResolvedValue([]);
    vi.spyOn(baseLocal.operaciones, 'bulkPut').mockResolvedValue(undefined as never);
    vi.spyOn(baseLocal.operaciones, 'bulkDelete').mockImplementation((async (claves: string[]) => {
      for (const clave of claves) guardadas.delete(String(clave));
    }) as never);
    vi.spyOn(baseLocal, 'transaction').mockImplementation(
      // La transacción se reduce a ejecutar el callback: lo que importa es qué
      // se borra y qué se conserva, no el aislamiento de IndexedDB.
      (async (_modo: unknown, _tabla: unknown, fn: () => Promise<void>) => fn()) as never,
    );

    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), SyncService, ConnectionService],
    });

    servicio = TestBed.inject(SyncService);
    http = TestBed.inject(HttpTestingController);
    conexion = TestBed.inject(ConnectionService);
    conexion.online.set(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const empujar = () => http.expectOne(`${environment.apiUrl}/sync/push`);

  /**
   * Deja correr las microtareas.
   *
   * Un solo `await` no basta: entre la respuesta y el estado final hay varias
   * promesas encadenadas —guardar en la base local, purgar lo confirmado y
   * refrescar el chip— y comprobar antes de que terminen mide un estado
   * intermedio que el usuario nunca ve.
   */
  const asentar = async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  };

  it('encolar guarda en local antes de tocar la red', async () => {
    // Lo que el técnico necesita saber es que su trabajo está a salvo; esperar
    // a la red convertiría cada tecla en una espera.
    const operacion = await servicio.encolar('editar-bloque', 'r1', { texto: 'hola' }, 'b1');

    expect(guardadas.has(operacion.clientOpId)).toBe(true);
    expect(operacion.estado).toBe('pendiente');
  });

  it('cada operación lleva su clientOpId, que es lo que evita el duplicado', async () => {
    const a = await servicio.encolar('editar-bloque', 'r1', {}, 'b1');
    empujar().flush({ resultados: [{ clientOpId: a.clientOpId, estado: 'aplicada' }] });
    await asentar();

    const b = await servicio.encolar('editar-bloque', 'r1', {}, 'b1');
    await asentar();
    const peticion = empujar();

    expect(b.clientOpId).not.toBe(a.clientOpId);
    expect(peticion.request.body.operaciones[0].clientOpId).toBe(b.clientOpId);
    peticion.flush({ resultados: [] });
  });

  it('«repetida» cuenta como confirmada y deja de estar pendiente', async () => {
    // El servidor ya la tenía: es justo lo que se buscaba al mandarla dos veces.
    const operacion = await servicio.encolar('agregar-foto', 'r1', {}, 'b1');
    empujar().flush({ resultados: [{ clientOpId: operacion.clientOpId, estado: 'repetida' }] });

    await asentar();
    expect(servicio.pendientesDe('r1')).toHaveLength(0);
    expect(conexion.pendingOperations()).toBe(0);
  });

  it('un fallo de red NO marca la operación como fallida: se reintenta', async () => {
    // Marcarla haría que un socavón se pareciera a un error de datos.
    const operacion = await servicio.encolar('editar-bloque', 'r1', {}, 'b1');
    empujar().error(new ProgressEvent('error'));

    await asentar();
    const pendientes = servicio.pendientesDe('r1');
    expect(pendientes).toHaveLength(1);
    expect(pendientes[0]?.estado).toBe('pendiente');
    expect(pendientes[0]?.clientOpId).toBe(operacion.clientOpId);
  });

  it('sin conexión no se intenta enviar nada', async () => {
    conexion.online.set(false);
    await servicio.encolar('editar-bloque', 'r1', {}, 'b1');

    http.expectNone(`${environment.apiUrl}/sync/push`);
    expect(conexion.pendingOperations()).toBe(1);
  });

  it('el chip cuenta el número exacto de cambios pendientes', async () => {
    // Sin conexión no se intenta enviar, así que las dos quedan en la cola: es
    // el número que el técnico mira para decidir si puede irse del sitio con
    // cobertura.
    conexion.online.set(false);
    await servicio.encolar('editar-bloque', 'r1', {}, 'b1');
    await servicio.encolar('editar-bloque', 'r1', {}, 'b2');

    await asentar();
    expect(conexion.pendingOperations()).toBe(2);
  });

  it('crear el informe se manda antes que lo que cuelga de él', async () => {
    conexion.online.set(false);
    const local = servicio.nuevoIdLocal();

    // Se encolan al revés a propósito: la foto primero.
    await servicio.encolar('agregar-foto', local, {}, 'b1');
    await servicio.encolar('crear-informe', local, { numeroInforme: 'ITS-1' });

    conexion.online.set(true);
    // Sin `await`: `sincronizar` no resuelve hasta que la petición se contesta,
    // y quien la contesta es este mismo test.
    void servicio.sincronizar();
    await asentar();

    const peticion = empujar();
    const enviadas = peticion.request.body.operaciones as { tipo: string }[];
    expect(enviadas[0]?.tipo).toBe('crear-informe');
    peticion.flush({ resultados: [] });
  });

  it('el id local se reconoce y lo genera el propio servicio', () => {
    const id = servicio.nuevoIdLocal();
    expect(id.startsWith('local:')).toBe(true);
  });
});

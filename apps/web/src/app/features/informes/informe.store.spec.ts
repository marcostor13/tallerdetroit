import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReportsService, TemplatesService, type Informe } from '../../core/api/reports.service';
import { InformeStore } from './informe.store';

/**
 * Comportamiento del autoguardado.
 *
 * Lo que se prueba aquí es lo que decide si el técnico pierde trabajo: que los
 * cambios se acumulen en vez de salir uno por pulsación, y que un corte de red
 * los devuelva a la cola en lugar de tirarlos.
 */
describe('InformeStore', () => {
  const informe = (extra: Partial<Informe> = {}): Informe =>
    ({
      _id: 'r1',
      numeroInforme: 'ITS-T-E-26-003-0746',
      templateCodigo: 'SER-FOR-002',
      templateVersion: 'v01',
      estado: 'borrador',
      bloques: [],
      datos: {},
      ...extra,
    }) as Informe;

  let api: {
    findById: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
    validate: ReturnType<typeof vi.fn>;
    reorder: ReturnType<typeof vi.fn>;
  };
  let store: InformeStore;

  beforeEach(async () => {
    vi.useFakeTimers();

    api = {
      findById: vi.fn().mockResolvedValue(informe()),
      patch: vi
        .fn()
        .mockResolvedValue({ guardadoEn: new Date().toISOString(), informe: informe() }),
      validate: vi.fn().mockResolvedValue({ emitible: false, faltan: [] }),
      reorder: vi.fn().mockResolvedValue(informe()),
    };

    TestBed.configureTestingModule({
      providers: [
        InformeStore,
        { provide: ReportsService, useValue: api },
        {
          provide: TemplatesService,
          useValue: {
            version: vi.fn().mockResolvedValue({
              codigo: 'SER-FOR-002',
              version: 'v01',
              nombre: 'x',
              estado: 'publicada',
              secciones: [],
            }),
          },
        },
      ],
    });

    store = TestBed.inject(InformeStore);
    await store.cargar('r1');
  });

  it('no manda una petición por pulsación: acumula y envía una sola vez', async () => {
    store.cambiar('datos.horasTotales', 17694);
    store.cambiar('datos.motivo', 'QL4');
    store.cambiar('datos.motivo', 'QL4 / W6-1');

    // Todavía no ha salido nada: se espera a que deje de escribir.
    expect(api.patch).toHaveBeenCalledTimes(0);
    expect(store.estadoGuardado()).toBe('pendiente');

    await vi.advanceTimersByTimeAsync(2_000);

    expect(api.patch).toHaveBeenCalledTimes(1);
    expect(api.patch).toHaveBeenCalledWith('r1', {
      'datos.horasTotales': 17694,
      'datos.motivo': 'QL4 / W6-1',
    });
    expect(store.estadoGuardado()).toBe('guardado');
  });

  it('escribe rutas concretas, no el objeto entero', async () => {
    // `datos.motivo` y no `datos`: si se mandara el objeto completo, un
    // autoguardado pisaría lo que otra pestaña acabara de escribir en un campo
    // distinto del mismo paso.
    store.cambiar('datos.motivo', 'QL4');
    await vi.advanceTimersByTimeAsync(2_000);

    const enviado = api.patch.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(Object.keys(enviado)).toEqual(['datos.motivo']);
  });

  it('el campo se ve al instante, sin esperar la respuesta del servidor', () => {
    // Sin esto el campo parpadea: se escribe y vuelve al valor viejo hasta que
    // contesta el servidor.
    store.cambiar('datos.horasTotales', 17694);
    expect(store.informe()?.datos?.['horasTotales']).toBe(17694);
  });

  it('si falla la red, los cambios vuelven a la cola y se reintentan', async () => {
    api.patch.mockRejectedValueOnce({ error: { detail: 'Sin conexión' } });

    store.cambiar('datos.motivo', 'QL4');
    await vi.advanceTimersByTimeAsync(2_000);

    expect(store.estadoGuardado()).toBe('error');
    expect(store.error()).toBe('Sin conexión');

    // El reintento periódico los recupera: perderlos sería perder trabajo del
    // técnico, que es lo que esta plataforma viene a evitar.
    await vi.advanceTimersByTimeAsync(21_000);

    expect(api.patch).toHaveBeenCalledTimes(2);
    expect(api.patch.mock.calls[1]?.[1]).toEqual({ 'datos.motivo': 'QL4' });
    expect(store.estadoGuardado()).toBe('guardado');
  });

  it('lo que se escriba mientras se guarda no se pierde', async () => {
    let resolver: (v: unknown) => void = () => undefined;
    api.patch.mockImplementationOnce(
      () =>
        new Promise((r: (v: unknown) => void) => {
          resolver = r;
        }),
    );

    store.cambiar('datos.a', 1);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(store.estadoGuardado()).toBe('guardando');

    // Sigue tecleando mientras la petición está en vuelo.
    store.cambiar('datos.b', 2);

    resolver({ guardadoEn: new Date().toISOString(), informe: informe() });
    await vi.advanceTimersByTimeAsync(2_000);

    expect(api.patch).toHaveBeenCalledTimes(2);
    expect(api.patch.mock.calls[1]?.[1]).toEqual({ 'datos.b': 2 });
  });

  it('un informe emitido no acepta cambios', async () => {
    api.findById.mockResolvedValue(informe({ estado: 'emitido' }));
    await store.cargar('r1');

    store.cambiar('datos.motivo', 'no debería');
    await vi.advanceTimersByTimeAsync(2_000);

    expect(store.soloLectura()).toBe(true);
    expect(api.patch).toHaveBeenCalledTimes(0);
  });

  it('mover un bloque devuelve la posición nueva, para poder seguir con el foco', async () => {
    api.findById.mockResolvedValue(
      informe({
        bloques: [
          { id: 'a', clave: 'trabajos', tipo: 'work_task', orden: 1 },
          { id: 'b', clave: 'trabajos', tipo: 'work_task', orden: 2 },
        ],
      }),
    );
    await store.cargar('r1');

    // Sin la posición de vuelta, la reordenación por teclado sería inservible:
    // el foco se quedaría atrás y la siguiente pulsación movería otro bloque.
    expect(await store.moverBloque(1, 0)).toBe(0);
    expect(api.reorder).toHaveBeenCalledWith('r1', 1, 0);

    // Un destino fuera de rango no llama al servidor ni mueve el foco.
    api.reorder.mockClear();
    expect(await store.moverBloque(0, 9)).toBe(0);
    expect(api.reorder).toHaveBeenCalledTimes(0);
  });
});

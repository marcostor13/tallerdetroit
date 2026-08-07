import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReportsService, TemplatesService, type Informe } from '../../core/api/reports.service';
import { InformeStore } from './informe.store';
import { InformesOfflineService } from '../../core/sync/informes-offline.service';

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
    transition: ReturnType<typeof vi.fn>;
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
      transition: vi.fn(),
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

  it('la respuesta del servidor no pisa lo que se escribió mientras iba en vuelo', async () => {
    let resolver: (v: unknown) => void = () => undefined;
    api.patch.mockImplementationOnce(
      () =>
        new Promise((r: (v: unknown) => void) => {
          resolver = r;
        }),
    );

    store.cambiar('datos.a', 1);
    await vi.advanceTimersByTimeAsync(2_000);

    // Mientras el guardado está en vuelo, el técnico elige una sede.
    store.cambiar('sede', { id: 's1', nombre: 'TALLER - AREQUIPA' });
    expect((store.informe()?.sede as { nombre?: string })?.nombre).toBe('TALLER - AREQUIPA');

    // El servidor contesta con un informe que todavía no la conoce.
    resolver({ guardadoEn: new Date().toISOString(), informe: informe() });
    await vi.advanceTimersByTimeAsync(100);

    // Y aun así sigue en pantalla: lo contrario es que al técnico se le borre
    // lo que acaba de elegir, aunque luego se guarde.
    expect((store.informe()?.sede as { nombre?: string })?.nombre).toBe('TALLER - AREQUIPA');
  });

  it('un informe emitido no acepta cambios', async () => {
    api.findById.mockResolvedValue(informe({ estado: 'emitido' }));
    await store.cargar('r1');

    store.cambiar('datos.motivo', 'no debería');
    await vi.advanceTimersByTimeAsync(2_000);

    expect(store.soloLectura()).toBe(true);
    expect(api.patch).toHaveBeenCalledTimes(0);
  });

  describe('emisión', () => {
    it('un error de emisión trae la lista de lo que falta (UX-07)', async () => {
      const faltan = [
        { seccion: 'Contexto', clave: 'antecedentes', titulo: 'Antecedentes', paso: 2 },
      ];
      // Forma real de un error de Angular: el cuerpo del problema va en `error`.
      api.transition.mockRejectedValue({
        error: { detail: 'Faltan 1 datos obligatorios para emitir.', faltan },
      });

      const resultado = await store.emitir();

      expect(resultado.ok).toBe(false);
      expect(resultado.faltan).toEqual(faltan);
      // Y queda en el almacén, que es de donde lo lee el panel navegable.
      expect(store.faltan()).toEqual(faltan);
      expect(store.error()).toMatch(/Faltan 1 datos/);
    });

    it('emitir con éxito deja el informe emitido', async () => {
      api.transition.mockResolvedValue(informe({ estado: 'emitido' }));
      const resultado = await store.emitir();

      expect(resultado.ok).toBe(true);
      expect(store.informe()?.estado).toBe('emitido');
      expect(store.error()).toBeNull();
    });

    it('manda lo pendiente antes de emitir', async () => {
      api.transition.mockResolvedValue(informe({ estado: 'emitido' }));
      store.cambiar('datos.motivo', 'QL4');

      await store.emitir();

      // Emitir con el ultimo cambio sin guardar congelaría un informe que no
      // es el que el técnico ve en pantalla.
      expect(api.patch).toHaveBeenCalledWith('r1', { 'datos.motivo': 'QL4' });
    });
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

/**
 * El editor sin conexión (E4.3).
 *
 * Lo que se prueba es que el técnico siga viendo lo que acaba de escribir
 * aunque no haya nadie al otro lado: sin respuesta del servidor, el cambio se
 * aplica en la copia local y la operación queda encolada.
 */
describe('InformeStore sin conexión', () => {
  const informe = (extra: Partial<Informe> = {}): Informe =>
    ({
      _id: 'r1',
      numeroInforme: 'ITS-T-E-26-003-0746',
      templateCodigo: 'SER-FOR-002',
      templateVersion: 'v01',
      estado: 'borrador',
      bloques: [{ id: 'b1', clave: 'trabajos', tipo: 'work_task', orden: 1, titulo: 'ANTES' }],
      datos: {},
      ...extra,
    }) as Informe;

  let store: InformeStore;
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let offline: {
    ejecutar: ReturnType<typeof vi.fn>;
    guardarLocal: ReturnType<typeof vi.fn>;
    leerLocal: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.useFakeTimers();

    api = {
      findById: vi.fn().mockResolvedValue(informe()),
      patch: vi.fn(),
      updateBlock: vi.fn(),
      guardarChecklist: vi.fn(),
      validate: vi.fn().mockResolvedValue({ emitible: false, faltan: [] }),
    };

    offline = {
      // `null` es la respuesta del servicio cuando la operación se encola.
      ejecutar: vi.fn().mockResolvedValue(null),
      guardarLocal: vi.fn().mockResolvedValue(undefined),
      leerLocal: vi.fn().mockResolvedValue(null),
    };

    TestBed.configureTestingModule({
      providers: [
        InformeStore,
        { provide: ReportsService, useValue: api },
        { provide: InformesOfflineService, useValue: offline },
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

  it('lo escrito se queda en pantalla aunque no haya respuesta del servidor', async () => {
    store.cambiar('datos.horasTotales', 12_500);
    await store.guardar();

    expect(store.informe()?.datos?.['horasTotales']).toBe(12_500);
    // Para el técnico está guardado: en su dispositivo. El chip dice lo que
    // falta por subir.
    expect(store.estadoGuardado()).toBe('guardado');
    expect(store.guardadoEn()).not.toBeNull();
  });

  it('el cambio va a la cola con su tipo de operación', async () => {
    store.cambiar('datos.horasTotales', 12_500);
    await store.guardar();

    expect(offline.ejecutar).toHaveBeenCalledWith(
      'editar-informe',
      'r1',
      { 'datos.horasTotales': 12_500 },
      null,
      expect.any(Function),
    );
  });

  it('editar un bloque sin red lo actualiza en la copia local', async () => {
    await store.editarBloque('b1', { titulo: 'DESPUÉS' });

    expect(store.bloquesOrdenados()[0]?.titulo).toBe('DESPUÉS');
    expect(offline.ejecutar).toHaveBeenCalledWith(
      'editar-bloque',
      'r1',
      { titulo: 'DESPUÉS' },
      'b1',
      expect.any(Function),
    );
  });

  it('el inventario capturado se aplica sin perder el catálogo', async () => {
    // El catálogo lo pone el servidor y no cambia por inventariar; lo que se
    // sustituye es lo encontrado.
    store.informe.set(
      informe({
        bloques: [
          {
            id: 'b9',
            clave: 'inventario-desarmado',
            tipo: 'checklist',
            orden: 1,
            checklist: { items: [{ clave: 'piston', denominacion: 'Pistones' }], capturado: [] },
          },
        ],
      } as Partial<Informe>),
    );

    await store.guardarChecklist('b9', [{ clave: 'piston', estado: 'ok', cantidad: 20 }]);

    const bloque = store.bloquesOrdenados()[0];
    expect(bloque?.checklist?.items).toHaveLength(1);
    expect(bloque?.checklist?.capturado).toEqual([{ clave: 'piston', estado: 'ok', cantidad: 20 }]);
  });

  it('cada cambio deja copia en el dispositivo', async () => {
    await store.editarBloque('b1', { titulo: 'DESPUÉS' });
    expect(offline.guardarLocal).toHaveBeenCalled();
  });
});

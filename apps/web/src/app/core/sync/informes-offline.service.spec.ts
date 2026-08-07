import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TemplateVersionDefinition } from '@dps/shared';
import { InformesOfflineService } from './informes-offline.service';
import { BASE_LOCAL } from './sync.db';
import { baseLocalFalsa, comoBaseLocal } from './testing/base-local.fake';
import { SyncService } from './sync.service';
import { ConnectionService } from '../connection/connection.service';
import type { Informe } from '../api/reports.service';

const base = baseLocalFalsa();

const PLANTILLA = {
  codigo: 'SER-FOR-002',
  version: 'v01',
  nombre: 'Informe de servicio',
  secciones: [],
} as unknown as TemplateVersionDefinition;

/**
 * La puerta por la que pasan las escrituras del editor (E4.3).
 *
 * Lo que decide aquí es cuándo una escritura va a la cola y cuándo no, y la
 * distinción que más importa no es «hay red o no»: es **qué clase de error**.
 * Encolar un 400 dejaría al técnico con un pendiente eterno que no puede
 * resolver, porque reintentar una petición mal formada no la arregla.
 */
describe('InformesOfflineService', () => {
  let servicio: InformesOfflineService;
  let cola: {
    encolar: ReturnType<typeof vi.fn>;
    nuevoIdLocal: ReturnType<typeof vi.fn>;
    alReasignarId: ReturnType<typeof vi.fn>;
  };
  let conexion: ConnectionService;
  /** El oyente que el servicio registra para las reasignaciones de id. */
  let alReasignar: (local: string, definitivo: string) => void;

  beforeEach(() => {
    base.vaciar();

    cola = {
      encolar: vi.fn().mockResolvedValue(undefined),
      nuevoIdLocal: vi.fn().mockReturnValue('local:abc'),
      alReasignarId: vi.fn().mockImplementation((oyente) => {
        alReasignar = oyente;
      }),
    };

    TestBed.configureTestingModule({
      providers: [
        InformesOfflineService,
        ConnectionService,
        { provide: SyncService, useValue: cola },
        { provide: BASE_LOCAL, useValue: comoBaseLocal(base) },
      ],
    });

    servicio = TestBed.inject(InformesOfflineService);
    conexion = TestBed.inject(ConnectionService);
    conexion.online.set(true);
  });

  const error = (status: number) =>
    new HttpErrorResponse({ status, statusText: 'x', url: '/api/v1/reports/r1' });

  describe('escrituras', () => {
    it('con red, la escritura va al servidor y no toca la cola', async () => {
      const enLinea = vi.fn().mockResolvedValue({ ok: true });

      const respuesta = await servicio.ejecutar('editar-bloque', 'r1', { a: 1 }, 'b1', enLinea);

      expect(respuesta).toEqual({ ok: true });
      expect(enLinea).toHaveBeenCalled();
      expect(cola.encolar).not.toHaveBeenCalled();
    });

    it('sin red se encola y ni se intenta la petición', async () => {
      conexion.online.set(false);
      const enLinea = vi.fn();

      const respuesta = await servicio.ejecutar('editar-bloque', 'r1', { a: 1 }, 'b1', enLinea);

      // `null` es la señal de que el editor tiene que aplicar el cambio en local:
      // no va a llegar ninguna respuesta que lo traiga.
      expect(respuesta).toBeNull();
      expect(enLinea).not.toHaveBeenCalled();
      expect(cola.encolar).toHaveBeenCalledWith('editar-bloque', 'r1', { a: 1 }, 'b1');
    });

    it('si la petición muere en el intento, se encola', async () => {
      // `status 0` es lo que da el navegador cuando la petición ni salió.
      const enLinea = vi.fn().mockRejectedValue(error(0));

      const respuesta = await servicio.ejecutar('editar-informe', 'r1', {}, null, enLinea);

      expect(respuesta).toBeNull();
      expect(cola.encolar).toHaveBeenCalled();
    });

    it('un 500 también: el servidor está, pero no puede', async () => {
      const enLinea = vi.fn().mockRejectedValue(error(503));

      expect(await servicio.ejecutar('editar-informe', 'r1', {}, null, enLinea)).toBeNull();
      expect(cola.encolar).toHaveBeenCalled();
    });

    it('un 400 NO se encola: se propaga para que el editor lo explique', async () => {
      // Reintentarlo cada dos minutos durante una semana no lo va a arreglar.
      const enLinea = vi.fn().mockRejectedValue(error(400));

      await expect(servicio.ejecutar('editar-informe', 'r1', {}, null, enLinea)).rejects.toThrow();
      expect(cola.encolar).not.toHaveBeenCalled();
    });

    it('un 409 tampoco: es un conflicto de negocio, no de red', async () => {
      const enLinea = vi.fn().mockRejectedValue(error(409));

      await expect(servicio.ejecutar('editar-bloque', 'r1', {}, 'b1', enLinea)).rejects.toThrow();
      expect(cola.encolar).not.toHaveBeenCalled();
    });

    it('un error que no es HTTP se propaga: no se sabe si reintentar ayuda', async () => {
      const enLinea = vi.fn().mockRejectedValue(new TypeError('roto'));

      await expect(servicio.ejecutar('editar-informe', 'r1', {}, null, enLinea)).rejects.toThrow(
        'roto',
      );
      expect(cola.encolar).not.toHaveBeenCalled();
    });
  });

  describe('crear un informe sin red (E4.3)', () => {
    beforeEach(async () => {
      await servicio.guardarPlantilla(PLANTILLA);
    });

    it('con red lo crea el servidor, que es quien asigna el correlativo', async () => {
      const enLinea = vi.fn().mockResolvedValue({ _id: 'r9' } as Informe);

      expect(await servicio.crear('ITS-1', enLinea)).toEqual({ _id: 'r9' });
      expect(cola.encolar).not.toHaveBeenCalled();
    });

    it('sin red nace en el dispositivo con un id local', async () => {
      conexion.online.set(false);

      const informe = await servicio.crear('ITS-1', vi.fn());

      expect(informe._id).toBe('local:abc');
      expect(informe.templateCodigo).toBe('SER-FOR-002');
      expect(cola.encolar).toHaveBeenCalledWith(
        'crear-informe',
        'local:abc',
        { numeroInforme: 'ITS-1' },
        null,
      );
    });

    it('si la petición muere en el intento, también', async () => {
      const informe = await servicio.crear('ITS-1', vi.fn().mockRejectedValue(error(0)));

      expect(informe._id).toBe('local:abc');
    });

    it('un número duplicado se propaga: crearlo en local lo duplicaría dos veces', async () => {
      // El 409 dice que ese número ya existe en el servidor. Crear el informe en
      // el dispositivo lo dejaría en la cola para fallar otra vez, y el técnico
      // creería que su informe está guardado cuando nunca va a subir.
      await expect(
        servicio.crear('ITS-1', vi.fn().mockRejectedValue(error(409))),
      ).rejects.toThrow();
      expect(cola.encolar).not.toHaveBeenCalled();
    });

    it('sin plantilla guardada lo dice, en vez de abrir un editor en blanco', async () => {
      base.plantillas.filas.clear();
      conexion.online.set(false);

      await expect(servicio.crear('ITS-1', vi.fn())).rejects.toThrow(/al menos una vez/);
      expect(cola.encolar).not.toHaveBeenCalled();
    });
  });

  describe('la bandeja de lo que no ha subido', () => {
    it('lista los informes locales que aún tienen algo en la cola', async () => {
      await servicio.guardarPlantilla(PLANTILLA);
      conexion.online.set(false);
      await servicio.crear('ITS-1', vi.fn());
      await base.operaciones.put({
        clientOpId: 'op1',
        tipo: 'editar-informe',
        informeId: 'local:abc',
        datos: {},
        capturadaEn: '2026-06-20T10:00:00.000Z',
        estado: 'pendiente',
        intentos: 0,
      });

      const locales = await servicio.informesLocales();

      expect(locales.map((i) => i.numeroInforme)).toEqual(['ITS-1']);
    });

    it('un informe del servidor no aparece como local', async () => {
      await servicio.guardarLocal({ _id: 'r1', numeroInforme: 'ITS-9' } as Informe);

      expect(await servicio.informesLocales()).toEqual([]);
    });

    it('borra la copia local del que ya no tiene nada pendiente', async () => {
      // Sin cola pendiente, el servidor ya lo confirmó. Seguir listándolo lo
      // duplicaría en la bandeja: una vez como local y otra como del servidor.
      await servicio.guardarLocal({ _id: 'local:viejo', numeroInforme: 'ITS-8' } as Informe);

      expect(await servicio.informesLocales()).toEqual([]);
      expect(base.informes.filas.has('local:viejo')).toBe(false);
    });
  });

  describe('cuando el servidor asigna el id definitivo', () => {
    it('la copia del dispositivo pasa a llamarse como en el servidor', async () => {
      await servicio.guardarLocal({ _id: 'local:abc', numeroInforme: 'ITS-1' } as Informe);

      alReasignar('local:abc', 'r7');
      await Promise.resolve();
      await Promise.resolve();

      // La copia se conserva: el técnico puede quedarse sin cobertura justo
      // después de sincronizar y tiene que poder abrir el informe igual.
      expect(await servicio.leerLocal('r7')).toMatchObject({ _id: 'r7', numeroInforme: 'ITS-1' });
      expect(await servicio.leerLocal('local:abc')).toBeNull();
    });
  });
});

import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InformesOfflineService } from './informes-offline.service';
import { SyncService } from './sync.service';
import { ConnectionService } from '../connection/connection.service';

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
  let cola: { encolar: ReturnType<typeof vi.fn> };
  let conexion: ConnectionService;

  beforeEach(() => {
    cola = { encolar: vi.fn().mockResolvedValue(undefined) };

    TestBed.configureTestingModule({
      providers: [
        InformesOfflineService,
        ConnectionService,
        { provide: SyncService, useValue: cola },
      ],
    });

    servicio = TestBed.inject(InformesOfflineService);
    conexion = TestBed.inject(ConnectionService);
    conexion.online.set(true);
  });

  const error = (status: number) =>
    new HttpErrorResponse({ status, statusText: 'x', url: '/api/v1/reports/r1' });

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

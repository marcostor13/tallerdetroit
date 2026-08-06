import { describe, expect, it } from 'vitest';
import {
  MAXIMO_DE_INTENTOS,
  TOPE_DE_BYTES,
  agotoLosIntentos,
  aplicarRespuesta,
  avisoDeAlmacenamiento,
  chocan,
  esIdLocal,
  esperaDeReintento,
  idLocal,
  operacionesPendientes,
  ordenarParaEnvio,
  purgarConfirmadas,
  reemplazarIdLocal,
  resumirCola,
  type OperacionOffline,
} from './sync';

const operacion = (parcial: Partial<OperacionOffline> = {}): OperacionOffline => ({
  clientOpId: 'op-1',
  tipo: 'editar-bloque',
  informeId: 'r1',
  bloqueId: 'b1',
  datos: {},
  capturadaEn: '2026-08-06T10:00:00.000Z',
  estado: 'pendiente',
  intentos: 0,
  ...parcial,
});

/**
 * Cola de operaciones offline (E4.4).
 *
 * Lo que se prueba es lo que decide si el técnico puede fiarse de la app: que un
 * reenvío no duplique nada, que lo capturado sin red no se pierda ni se
 * desordene, y que dos personas editando bloques distintos no se pisen.
 */
describe('Cola de sincronización', () => {
  describe('identificadores locales', () => {
    it('un informe creado sin red arranca con un id local reconocible', () => {
      const id = idLocal('abc-123');
      expect(esIdLocal(id)).toBe(true);
      expect(esIdLocal('64f0c0ffee')).toBe(false);
      expect(esIdLocal(null)).toBe(false);
    });

    it('al confirmar la creación, todo lo que colgaba del id local lo sigue', () => {
      // Las veinte fotos que el técnico sacó antes de recuperar señal se
      // quedarían huérfanas si no se reasignaran.
      const cola = [
        operacion({ clientOpId: 'op-1', tipo: 'crear-informe', informeId: 'local:x' }),
        operacion({ clientOpId: 'op-2', tipo: 'agregar-foto', informeId: 'local:x' }),
        operacion({ clientOpId: 'op-3', informeId: 'otro' }),
      ];

      const despues = reemplazarIdLocal(cola, 'local:x', 'r99');

      expect(despues.map((o) => o.informeId)).toEqual(['r99', 'r99', 'otro']);
    });
  });

  describe('orden de envío', () => {
    it('crear el informe va antes que cualquier cosa suya', () => {
      // «Editar el bloque 3» de un informe que el servidor no conoce es un 404.
      const cola = [
        operacion({ clientOpId: 'b', capturadaEn: '2026-08-06T10:05:00.000Z' }),
        operacion({
          clientOpId: 'a',
          tipo: 'crear-informe',
          capturadaEn: '2026-08-06T10:09:00.000Z',
        }),
      ];

      expect(ordenarParaEnvio(cola).map((o) => o.clientOpId)).toEqual(['a', 'b']);
    });

    it('dentro del informe manda el orden de captura, no el de la cola', () => {
      const cola = [
        operacion({ clientOpId: 'tarde', capturadaEn: '2026-08-06T12:00:00.000Z' }),
        operacion({ clientOpId: 'pronto', capturadaEn: '2026-08-06T09:00:00.000Z' }),
      ];

      expect(ordenarParaEnvio(cola).map((o) => o.clientOpId)).toEqual(['pronto', 'tarde']);
    });

    it('no modifica la cola original', () => {
      const cola = [operacion({ clientOpId: 'b' }), operacion({ clientOpId: 'a' })];
      ordenarParaEnvio(cola);
      expect(cola.map((o) => o.clientOpId)).toEqual(['b', 'a']);
    });
  });

  describe('respuesta del servidor', () => {
    it('una operación aplicada queda confirmada', () => {
      const despues = aplicarRespuesta([operacion()], [{ clientOpId: 'op-1', estado: 'aplicada' }]);
      expect(despues[0]?.estado).toBe('confirmada');
    });

    it('una REPETIDA también: es justo lo que se buscaba al mandarla dos veces', () => {
      // Tratarla como error dejaría al técnico viendo pendientes cosas que sí
      // están guardadas.
      const despues = aplicarRespuesta(
        [operacion({ intentos: 2 })],
        [{ clientOpId: 'op-1', estado: 'repetida' }],
      );
      expect(despues[0]?.estado).toBe('confirmada');
      expect(despues[0]?.error).toBeNull();
    });

    it('un error suma un intento y explica qué pasó', () => {
      const despues = aplicarRespuesta(
        [operacion()],
        [{ clientOpId: 'op-1', estado: 'error', detalle: 'El bloque ya no existe.' }],
      );
      expect(despues[0]).toMatchObject({
        estado: 'fallida',
        intentos: 1,
        error: 'El bloque ya no existe.',
      });
    });

    it('un conflicto no suma intentos: reintentar no lo resuelve', () => {
      const despues = aplicarRespuesta(
        [operacion({ intentos: 3 })],
        [{ clientOpId: 'op-1', estado: 'conflicto' }],
      );
      expect(despues[0]?.estado).toBe('conflicto');
      expect(despues[0]?.intentos).toBe(3);
    });

    it('la creación confirmada arrastra el id definitivo a toda la cola', () => {
      const cola = [
        operacion({ clientOpId: 'crear', tipo: 'crear-informe', informeId: 'local:x' }),
        operacion({ clientOpId: 'foto', tipo: 'agregar-foto', informeId: 'local:x' }),
      ];

      const despues = aplicarRespuesta(cola, [
        { clientOpId: 'crear', estado: 'aplicada', informeId: 'r42' },
      ]);

      expect(despues.map((o) => o.informeId)).toEqual(['r42', 'r42']);
      // Y la foto sigue pendiente: solo se confirmó la creación.
      expect(despues[1]?.estado).toBe('pendiente');
    });

    it('lo que no viene en la respuesta se queda como estaba', () => {
      const despues = aplicarRespuesta(
        [operacion({ clientOpId: 'op-1' }), operacion({ clientOpId: 'op-2' })],
        [{ clientOpId: 'op-1', estado: 'aplicada' }],
      );
      expect(despues[1]?.estado).toBe('pendiente');
    });
  });

  describe('reintentos', () => {
    it('la espera crece pero no se dispara', () => {
      // Sin tope, un informe con un día de retraso esperaría horas y no subiría
      // nunca aunque volviera la red.
      expect(esperaDeReintento(1)).toBe(2_000);
      expect(esperaDeReintento(3)).toBe(8_000);
      expect(esperaDeReintento(20)).toBe(5 * 60_000);
    });

    it('pasados los intentos, la operación pide ayuda en vez de callar', () => {
      expect(agotoLosIntentos({ intentos: MAXIMO_DE_INTENTOS - 1 })).toBe(false);
      expect(agotoLosIntentos({ intentos: MAXIMO_DE_INTENTOS })).toBe(true);
    });
  });

  describe('conflictos por bloque (E4.5)', () => {
    it('dos técnicos en bloques distintos no se pisan', () => {
      const a = operacion({ clientOpId: 'a', bloqueId: 'b1' });
      const b = operacion({ clientOpId: 'b', bloqueId: 'b2' });
      expect(chocan(a, b)).toBe(false);
    });

    it('el mismo bloque sí choca', () => {
      const a = operacion({ clientOpId: 'a', bloqueId: 'b1' });
      const b = operacion({ clientOpId: 'b', bloqueId: 'b1' });
      expect(chocan(a, b)).toBe(true);
    });

    it('el mismo bloque en informes distintos, no', () => {
      const a = operacion({ clientOpId: 'a', informeId: 'r1', bloqueId: 'b1' });
      const b = operacion({ clientOpId: 'b', informeId: 'r2', bloqueId: 'b1' });
      expect(chocan(a, b)).toBe(false);
    });

    it('una operación no choca consigo misma', () => {
      const a = operacion();
      expect(chocan(a, { ...a })).toBe(false);
    });

    it('dos ediciones del informe entero, del mismo tipo, sí chocan', () => {
      const a = operacion({ clientOpId: 'a', tipo: 'editar-informe', bloqueId: null });
      const b = operacion({ clientOpId: 'b', tipo: 'editar-informe', bloqueId: null });
      expect(chocan(a, b)).toBe(true);
    });
  });

  describe('lo que ve el chip de conexión', () => {
    it('cuenta lo pendiente y lo fallido, no lo que está en vuelo', () => {
      const cola = [
        operacion({ clientOpId: '1', estado: 'pendiente' }),
        operacion({ clientOpId: '2', estado: 'enviando' }),
        operacion({ clientOpId: '3', estado: 'fallida' }),
        operacion({ clientOpId: '4', estado: 'confirmada' }),
      ];

      expect(operacionesPendientes(cola).map((o) => o.clientOpId)).toEqual(['1', '3']);
    });

    it('el resumen cuenta también cuántos informes están sin sincronizar', () => {
      const cola = [
        operacion({ clientOpId: '1', informeId: 'r1' }),
        operacion({ clientOpId: '2', informeId: 'r1', estado: 'fallida' }),
        operacion({ clientOpId: '3', informeId: 'r2', estado: 'conflicto' }),
        operacion({ clientOpId: '4', informeId: 'r3', estado: 'confirmada' }),
      ];

      expect(resumirCola(cola)).toEqual({
        pendientes: 1,
        enviando: 0,
        fallidas: 1,
        conflictos: 1,
        informes: 2,
      });
    });

    it('las confirmadas se purgan y el resto se conserva', () => {
      // Nada se borra en local hasta que el servidor confirma.
      const cola = [
        operacion({ clientOpId: '1', estado: 'confirmada' }),
        operacion({ clientOpId: '2', estado: 'fallida' }),
      ];
      expect(purgarConfirmadas(cola).map((o) => o.clientOpId)).toEqual(['2']);
    });
  });

  describe('avisos de almacenamiento (E4.8)', () => {
    it('con poco ocupado y todo sincronizado no dice nada', () => {
      expect(avisoDeAlmacenamiento({ bytes: 1024, informesSinSincronizar: 0 })).toBeNull();
    });

    it('más de cinco informes sin sincronizar se avisa', () => {
      const aviso = avisoDeAlmacenamiento({ bytes: 0, informesSinSincronizar: 6 });
      expect(aviso).toContain('6 informes sin sincronizar');
      expect(aviso).toContain('solo existen en este dispositivo');
    });

    it('pasado el medio giga, también', () => {
      const aviso = avisoDeAlmacenamiento({
        bytes: TOPE_DE_BYTES + 1024 * 1024,
        informesSinSincronizar: 1,
      });
      expect(aviso).toContain('MB en este dispositivo');
    });

    it('manda el aviso de informes: es el que puede costar trabajo perdido', () => {
      const aviso = avisoDeAlmacenamiento({
        bytes: TOPE_DE_BYTES * 2,
        informesSinSincronizar: 9,
      });
      expect(aviso).toContain('9 informes');
    });
  });
});

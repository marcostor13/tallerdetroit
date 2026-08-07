import { describe, expect, it } from 'vitest';
import {
  INTERVALO_DE_SINCRONIZACION,
  MAESTROS_EN_CACHE,
  describirCache,
  estaVigente,
  mezclarDelta,
  seCachea,
  tocaSincronizar,
} from './masters-cache';

/**
 * Caché de maestros en el dispositivo (E4.2).
 *
 * Lo que se prueba aquí es lo que decide si el técnico encuentra su cliente en
 * el socavón: qué se guarda, cuándo se refresca y —lo que más se olvida— qué se
 * borra cuando un registro deja de valer.
 */
describe('caché de maestros', () => {
  describe('qué se guarda', () => {
    it('los catálogos del wizard sí; los de administración no', () => {
      // Bajar los 35 al iniciar sesión costaría megabytes por catálogos que
      // solo mira Calidad desde su escritorio, con red.
      expect(seCachea('clients')).toBe(true);
      expect(seCachea('sites')).toBe(true);
      expect(seCachea('engineSpecs')).toBe(true);

      expect(seCachea('organizations')).toBe(false);
      expect(seCachea('businessUnits')).toBe(false);
    });

    it('la lista no tiene repetidos', () => {
      expect(new Set(MAESTROS_EN_CACHE).size).toBe(MAESTROS_EN_CACHE.length);
    });
  });

  describe('cuándo se refresca', () => {
    const ahora = new Date('2026-06-20T12:00:00.000Z');

    it('nunca sincronizado siempre toca', () => {
      expect(tocaSincronizar(null, ahora)).toBe(true);
    });

    it('a las cuatro horas toca; antes no', () => {
      expect(tocaSincronizar('2026-06-20T08:00:00.000Z', ahora)).toBe(true);
      expect(tocaSincronizar('2026-06-20T08:00:01.000Z', ahora)).toBe(false);
    });

    it('abrir la app seis veces en una mañana no son seis descargas', () => {
      // Se cuenta desde la última respuesta del servidor, no desde el arranque.
      const haceDiezMinutos = new Date(ahora.getTime() - 10 * 60_000).toISOString();
      expect(tocaSincronizar(haceDiezMinutos, ahora)).toBe(false);
    });

    it('una fecha corrupta se trata como «nunca», no revienta', () => {
      // Un `localStorage` manipulado o una migración a medias no pueden dejar
      // la caché congelada para siempre.
      expect(tocaSincronizar('no es una fecha', ahora)).toBe(true);
    });

    it('el intervalo es el de §18', () => {
      expect(INTERVALO_DE_SINCRONIZACION).toBe(4 * 60 * 60 * 1000);
    });
  });

  describe('qué se borra', () => {
    it('una sede desactivada sale de la caché', () => {
      // Sin esto el técnico seguiría viéndola en el desplegable para siempre:
      // un cliente que solo recibe registros activos nunca se entera de la baja.
      expect(estaVigente({ _id: 's1', activo: false })).toBe(false);
      expect(estaVigente({ _id: 's2', deletedAt: '2026-06-20T10:00:00.000Z' })).toBe(false);
      expect(estaVigente({ _id: 's3', activo: true })).toBe(true);
    });

    it('sin campo `activo` se considera vigente', () => {
      // No todos los catálogos lo llevan; ausencia no es baja.
      expect(estaVigente({ _id: 's4' })).toBe(true);
    });

    it('el delta se parte en lo que se guarda y lo que se quita', () => {
      const { guardar, borrar } = mezclarDelta([
        { _id: 'c1', nombreCorto: 'SPCC. TOQUEPALA' },
        { _id: 'c2', nombreCorto: 'CERRO VERDE', activo: false },
        { _id: 'c3', nombreCorto: 'ANTAMINA', deletedAt: '2026-06-01T00:00:00.000Z' },
      ]);

      expect(guardar.map((r) => r._id)).toEqual(['c1']);
      expect(borrar).toEqual(['c2', 'c3']);
    });
  });

  describe('lo que se le enseña al técnico antes de bajar', () => {
    const ahora = new Date('2026-06-20T12:00:00.000Z');

    it('sin nada guardado lo dice claro', () => {
      const resumen = describirCache([{ coleccion: 'clients', sincronizadoHasta: null }], ahora);

      expect(resumen.maestros).toBe(0);
      expect(resumen.alDia).toBe(false);
      expect(resumen.texto).toMatch(/Todavía no hay maestros/);
    });

    it('dice cuántos y de cuándo, no solo «sincronizado»', () => {
      // «Sincronizado hace 3 horas» es accionable; «sincronizado» no.
      const resumen = describirCache(
        [
          { coleccion: 'clients', sincronizadoHasta: '2026-06-20T09:00:00.000Z' },
          { coleccion: 'sites', sincronizadoHasta: '2026-06-20T11:30:00.000Z' },
        ],
        ahora,
      );

      expect(resumen.maestros).toBe(2);
      expect(resumen.alDia).toBe(true);
      expect(resumen.texto).toMatch(/2 catálogos/);
      // Manda el más viejo: es el que decide si algo puede faltar.
      expect(resumen.texto).toMatch(/hace 3 horas/);
    });

    it('si el más viejo pasó de las cuatro horas, no está al día', () => {
      const resumen = describirCache(
        [
          { coleccion: 'clients', sincronizadoHasta: '2026-06-20T05:00:00.000Z' },
          { coleccion: 'sites', sincronizadoHasta: '2026-06-20T11:59:00.000Z' },
        ],
        ahora,
      );

      expect(resumen.alDia).toBe(false);
      expect(resumen.texto).toMatch(/hace 7 horas/);
    });
  });
});

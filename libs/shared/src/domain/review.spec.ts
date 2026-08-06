import { describe, expect, it } from 'vitest';
import {
  comentariosAbiertos,
  comentariosDeBloque,
  normalizarComentario,
  puedeAprobar,
  puedeObservar,
  resumirRevision,
  type ComentarioDeRevision,
} from './review';

const comentario = (parcial: Partial<ComentarioDeRevision> = {}): ComentarioDeRevision => ({
  id: 'c1',
  bloqueId: 'b1',
  texto: 'El encaje de la camisa 7 está fuera y no lleva justificación.',
  autorNombre: 'J. Salazar',
  fecha: '2026-08-06T12:00:00.000Z',
  resuelto: false,
  ...parcial,
});

/**
 * Las reglas de la revisión (E3.2).
 *
 * Son las que deciden si el ciclo de control sirve de algo: qué hace falta para
 * devolver un informe y qué impide aprobarlo.
 */
describe('Revisión colaborativa', () => {
  describe('observar exige señalar dónde (§14.2)', () => {
    it('con un comentario anclado a un bloque, sí', () => {
      expect(puedeObservar([comentario()])).toBe(true);
    });

    it('sin ningún comentario, no', () => {
      expect(puedeObservar([])).toBe(false);
    });

    it('con un comentario general y ninguno anclado, no', () => {
      // «Revísalo» sin decir dónde deja al técnico repasando catorce trabajos.
      expect(puedeObservar([comentario({ bloqueId: null })])).toBe(false);
    });

    it('un comentario anclado pero ya resuelto no vale para observar', () => {
      expect(puedeObservar([comentario({ resuelto: true })])).toBe(false);
    });
  });

  describe('aprobar exige no dejar nada abierto', () => {
    it('sin comentarios, se aprueba', () => {
      expect(puedeAprobar([])).toBe(true);
    });

    it('con todos resueltos, se aprueba', () => {
      expect(puedeAprobar([comentario({ resuelto: true })])).toBe(true);
    });

    it('con uno abierto, no', () => {
      expect(puedeAprobar([comentario({ resuelto: true }), comentario({ id: 'c2' })])).toBe(false);
    });

    it('un comentario general abierto también bloquea', () => {
      // No importa que no señale un bloque: alguien escribió algo que nadie
      // atendió, y aprobar así deja el informe señalado y aprobado a la vez.
      expect(puedeAprobar([comentario({ bloqueId: null })])).toBe(false);
    });
  });

  describe('resumen', () => {
    it('cuenta abiertos, resueltos y cuántos señalan un bloque', () => {
      const resumen = resumirRevision([
        comentario({ id: 'c1' }),
        comentario({ id: 'c2', bloqueId: null }),
        comentario({ id: 'c3', resuelto: true }),
      ]);

      expect(resumen).toEqual({ total: 3, abiertos: 2, resueltos: 1, anclados: 1 });
    });

    it('sin comentarios el resumen es todo a cero, no vacío', () => {
      expect(resumirRevision([])).toEqual({ total: 0, abiertos: 0, resueltos: 0, anclados: 0 });
    });
  });

  describe('agrupación por bloque', () => {
    it('cada bloque ve solo lo suyo', () => {
      const todos = [
        comentario({ id: 'c1', bloqueId: 'b1' }),
        comentario({ id: 'c2', bloqueId: 'b2' }),
        comentario({ id: 'c3', bloqueId: 'b1', resuelto: true }),
      ];

      expect(comentariosDeBloque(todos, 'b1').map((c) => c.id)).toEqual(['c1', 'c3']);
      expect(comentariosDeBloque(todos, 'b2').map((c) => c.id)).toEqual(['c2']);
    });

    it('los generales no se cuelan en ningún bloque', () => {
      expect(comentariosDeBloque([comentario({ bloqueId: null })], 'b1')).toHaveLength(0);
    });

    it('los abiertos se filtran sin perder el resto', () => {
      const todos = [comentario({ id: 'c1' }), comentario({ id: 'c2', resuelto: true })];
      expect(comentariosAbiertos(todos).map((c) => c.id)).toEqual(['c1']);
    });
  });

  describe('texto del comentario', () => {
    it('se recorta', () => {
      expect(normalizarComentario('  falta la foto  ')).toBe('falta la foto');
    });

    it('vacío o solo espacios no es un comentario', () => {
      expect(normalizarComentario('')).toBeNull();
      expect(normalizarComentario('   ')).toBeNull();
      expect(normalizarComentario('\n\t')).toBeNull();
    });

    it('lo que no es texto tampoco', () => {
      expect(normalizarComentario(undefined)).toBeNull();
      expect(normalizarComentario(42)).toBeNull();
      expect(normalizarComentario({ texto: 'hola' })).toBeNull();
    });
  });
});

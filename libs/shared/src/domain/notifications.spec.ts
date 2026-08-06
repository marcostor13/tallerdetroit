import { describe, expect, it } from 'vitest';
import {
  ESTADOS_QUE_AVISAN,
  avisaAlCambiarA,
  componerAviso,
  destinatariosDe,
  type InformeParaAviso,
} from './notifications';

const INFORME: InformeParaAviso = {
  id: 'r1',
  numeroInforme: 'ITS-T-E-26-003-0898',
  numeroOt: 'LIM-TAL-000898',
  cliente: 'SPCC. TOQUEPALA',
  equipo: 'VQT-130',
  actorNombre: 'J. SALAZAR',
};

const TECNICO = { email: 'rcaceres@detroitpower.pe', nombre: 'R. CÁCERES' };
const SUPERVISOR = { email: 'jsalazar@detroitpower.pe', nombre: 'J. SALAZAR' };

/**
 * Avisos del flujo de aprobación (E3.9).
 *
 * Lo que se prueba es lo que decide si el aviso sirve: que solo lleguen los
 * cuatro que importan, que digan qué se espera de quien los lee, y que nadie
 * reciba un correo de lo que acaba de hacer él mismo.
 */
describe('Avisos del flujo', () => {
  describe('qué avisa y qué no', () => {
    it('avisan las cuatro transiciones del criterio', () => {
      expect([...ESTADOS_QUE_AVISAN]).toEqual(['en_revision', 'observado', 'aprobado', 'emitido']);
    });

    it('un borrador que sigue siendo borrador no avisa', () => {
      expect(avisaAlCambiarA('borrador')).toBe(false);
      expect(componerAviso('borrador', INFORME)).toBeNull();
    });

    it('anular no avisa por correo: se decide y se comunica de otra forma', () => {
      expect(avisaAlCambiarA('anulado')).toBe(false);
      expect(componerAviso('anulado', INFORME)).toBeNull();
    });
  });

  describe('el asunto', () => {
    it('lleva el número de informe delante, que es lo que se busca', () => {
      // Quien lo recibe tiene treinta correos parecidos; lo que distingue uno
      // de otro es el número, no el verbo.
      for (const estado of ESTADOS_QUE_AVISAN) {
        const aviso = componerAviso(estado, INFORME);
        expect(aviso?.asunto.startsWith('ITS-T-E-26-003-0898')).toBe(true);
      }
    });
  });

  describe('el cuerpo dice qué hacer', () => {
    it('enviado a revisión le pide al revisor que revise', () => {
      const aviso = componerAviso('en_revision', INFORME);
      expect(aviso?.cuerpo).toContain('J. SALAZAR');
      expect(aviso?.cuerpo).toMatch(/devuélvelo con observaciones o apruébalo/i);
    });

    it('observado lleva el motivo en el propio correo', () => {
      // El técnico decide desde el móvil si tiene que dejar lo que está
      // haciendo; obligarle a entrar para saber qué pasa no ayuda.
      const aviso = componerAviso('observado', {
        ...INFORME,
        comentario: 'El apoyo 7 está fuera y no lleva justificación.',
        observacionesAbiertas: 2,
      });

      expect(aviso?.cuerpo).toContain('2 observación(es)');
      expect(aviso?.cuerpo).toContain('El apoyo 7 está fuera');
      expect(aviso?.cuerpo).toMatch(/vuelve a enviarlo a revisión/i);
    });

    it('sin comentario, el aviso de observado no imprime «null»', () => {
      const aviso = componerAviso('observado', { ...INFORME, comentario: null });
      expect(aviso?.cuerpo).not.toContain('null');
      expect(aviso?.cuerpo).not.toContain('Motivo:');
    });

    it('emitido avisa de que ya no se puede editar', () => {
      const aviso = componerAviso('emitido', INFORME);
      expect(aviso?.cuerpo).toMatch(/inmutable/i);
      expect(aviso?.cuerpo).toMatch(/hash de verificación/i);
    });

    it('el encabezado identifica el informe sin campos vacíos', () => {
      const aviso = componerAviso('aprobado', {
        id: 'r2',
        numeroInforme: 'ITS-T-E-26-003-0999',
        actorNombre: 'ADMIN',
      });

      expect(aviso?.cuerpo).toContain('ITS-T-E-26-003-0999');
      expect(aviso?.cuerpo).not.toContain('·  ·');
      expect(aviso?.cuerpo).not.toContain('undefined');
    });

    it('el enlace lleva al informe', () => {
      expect(componerAviso('aprobado', INFORME)?.ruta).toBe('/informes/r1');
    });
  });

  describe('a quién se avisa', () => {
    const participantes = { autor: TECNICO, revisores: [SUPERVISOR] };

    it('al enviar a revisión, al revisor: es quien tiene que actuar', () => {
      const destinos = destinatariosDe('en_revision', participantes, TECNICO.email);
      expect(destinos.map((d) => d.email)).toEqual([SUPERVISOR.email]);
    });

    it('al observar, al autor: es quien corrige', () => {
      const destinos = destinatariosDe('observado', participantes, SUPERVISOR.email);
      expect(destinos.map((d) => d.email)).toEqual([TECNICO.email]);
    });

    it('al aprobar y al emitir se entera todo el que participa', () => {
      const destinos = destinatariosDe('aprobado', participantes, 'admin@detroitpower.pe');
      expect(destinos.map((d) => d.email)).toEqual([TECNICO.email, SUPERVISOR.email]);
    });

    it('nadie recibe un correo de lo que acaba de hacer él mismo', () => {
      // Recibir el aviso de tu propia acción enseña a ignorar los avisos.
      const destinos = destinatariosDe('aprobado', participantes, SUPERVISOR.email);
      expect(destinos.map((d) => d.email)).toEqual([TECNICO.email]);
    });

    it('el mismo correo dos veces se manda una', () => {
      const destinos = destinatariosDe(
        'emitido',
        { autor: TECNICO, revisores: [{ email: 'RCACERES@detroitpower.pe' }] },
        null,
      );
      expect(destinos).toHaveLength(1);
    });

    it('sin destinatarios no se inventa ninguno', () => {
      expect(destinatariosDe('en_revision', {}, null)).toHaveLength(0);
      expect(destinatariosDe('observado', { autor: null }, null)).toHaveLength(0);
    });
  });
});

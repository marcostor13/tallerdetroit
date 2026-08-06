import { describe, expect, it } from 'vitest';
import { SER_FOR_002_V01 } from './ser-for-002';
import {
  BLOCK_TYPES,
  findMissingBlocks,
  isRepeatable,
  resolveBlocks,
  resolveTemplate,
  validateTemplate,
  type TemplateVersionDefinition,
} from './templates';

/** Contexto del OT-746: motor MTU de camión minero, sin tercerizados. */
const OT746 = {
  equipo: { categoria: 'camion_minero', codigo: 'VQT-130' },
  motor: { tieneCac: true, cilindros: 20, modeloId: 'm20v' },
  intervencion: { codigo: 'QL4' },
  informe: { tercerizados: [], mediciones: [] },
};

/** Contexto del OT-898: mismo formato, pero con componentes enviados a terceros. */
const OT898 = {
  equipo: { categoria: 'camion_minero', codigo: 'VQT-131' },
  motor: { tieneCac: true, cilindros: 16, modeloId: 'm16v' },
  intervencion: { codigo: 'W6-1' },
  informe: {
    tercerizados: [{ descripcion: 'Rectificado de cigüeñal' }],
    mediciones: [{ nombre: 'Diámetro túnel de bancada' }],
  },
};

/** Un grupo electrógeno: el caso para el que existe `parameters_panel`. */
const GRUPO_ELECTROGENO = {
  equipo: { categoria: 'grupo_electrogeno', codigo: 'GE-01' },
  motor: { tieneCac: false, cilindros: 12 },
  intervencion: { codigo: 'PM' },
  informe: { tercerizados: [], mediciones: [] },
};

describe('Motor de plantillas', () => {
  describe('resolución contra el contexto', () => {
    it('el panel de ECU no aparece en un camión minero y sí en un grupo electrógeno', () => {
      // El defecto concreto del prototipo: pedía rpm, kW y frecuencia de
      // generador en la evaluación de un motor de camión.
      const enCamion = resolveTemplate(SER_FOR_002_V01, OT746).map((s) => s.clave);
      const enGrupo = resolveTemplate(SER_FOR_002_V01, GRUPO_ELECTROGENO).map((s) => s.clave);

      expect(enCamion).not.toContain('parametros-ecu');
      expect(enGrupo).toContain('parametros-ecu');
    });

    it('la sección de tercerizados solo sale cuando los hay', () => {
      expect(resolveTemplate(SER_FOR_002_V01, OT746).map((s) => s.clave)).not.toContain(
        'tercerizados',
      );
      expect(resolveTemplate(SER_FOR_002_V01, OT898).map((s) => s.clave)).toContain('tercerizados');
    });

    it('el criterio de F1: los dos informes reales salen distintos sin tocar código', () => {
      const en746 = resolveTemplate(SER_FOR_002_V01, OT746).map((s) => s.clave);
      const en898 = resolveTemplate(SER_FOR_002_V01, OT898).map((s) => s.clave);

      expect(en746).not.toEqual(en898);
      // Y aun así comparten el esqueleto obligatorio del formato controlado.
      for (const comun of [
        'datos-generales',
        'datos-equipo',
        'trabajos',
        'conclusiones',
        'firmas',
      ]) {
        expect(en746).toContain(comun);
        expect(en898).toContain(comun);
      }
    });

    it('devuelve secciones y bloques ordenados', () => {
      const secciones = resolveTemplate(SER_FOR_002_V01, OT898);
      const ordenes = secciones.map((s) => s.orden);
      expect(ordenes).toEqual([...ordenes].sort((a, b) => a - b));

      for (const seccion of secciones) {
        const dentro = seccion.bloques.map((b) => b.orden);
        expect(dentro).toEqual([...dentro].sort((a, b) => a - b));
      }
    });

    it('una sección oculta se lleva sus bloques, aunque el bloque no tenga regla', () => {
      const claves = resolveBlocks(SER_FOR_002_V01, OT746).map((b) => b.clave);
      expect(claves).not.toContain('parametros-ecu');
      expect(claves).toContain('trabajos');
    });
  });

  describe('campos faltantes para emitir (UX-07)', () => {
    it('nombra cada bloque obligatorio vacío con el paso al que hay que ir', () => {
      const faltan = findMissingBlocks(SER_FOR_002_V01, OT746, new Set());

      expect(faltan.length).toBeGreaterThan(0);
      // Sirve para navegar por clic: cada aviso sabe a qué paso lleva.
      for (const f of faltan) {
        expect(f.paso).toBeGreaterThanOrEqual(1);
        expect(f.titulo).toBeTruthy();
        expect(f.seccion).toBeTruthy();
      }
      expect(faltan.map((f) => f.clave)).toContain('antecedentes');
      expect(faltan.map((f) => f.clave)).toContain('conclusiones');
    });

    it('no reclama lo que el informe ya tiene', () => {
      const todas = new Set(resolveBlocks(SER_FOR_002_V01, OT746).map((b) => b.clave));
      expect(findMissingBlocks(SER_FOR_002_V01, OT746, todas)).toEqual([]);
    });

    it('no reclama bloques de secciones que este informe no muestra', () => {
      const faltan = findMissingBlocks(SER_FOR_002_V01, OT746, new Set());
      expect(faltan.map((f) => f.clave)).not.toContain('parametros-ecu');
    });
  });

  describe('validación al publicar', () => {
    it('SER-FOR-002 v01 es coherente', () => {
      expect(validateTemplate(SER_FOR_002_V01)).toEqual([]);
    });

    it('detecta claves de bloque repetidas: se pisarían los datos', () => {
      const rota: TemplateVersionDefinition = {
        ...SER_FOR_002_V01,
        secciones: [
          {
            clave: 'a',
            numeral: 'I',
            titulo: 'Uno',
            orden: 1,
            paso: 1,
            bloques: [{ clave: 'repetida', tipo: 'rich_text', titulo: 'A', orden: 1 }],
          },
          {
            clave: 'b',
            numeral: 'II',
            titulo: 'Dos',
            orden: 2,
            paso: 1,
            bloques: [{ clave: 'repetida', tipo: 'rich_text', titulo: 'B', orden: 1 }],
          },
        ],
      };

      const errores = validateTemplate(rota);
      expect(errores.join(' ')).toMatch(/repetida/);
    });

    it('caza una regla de visibilidad mal escrita, que en ejecución pasaría inadvertida', () => {
      const rota: TemplateVersionDefinition = {
        ...SER_FOR_002_V01,
        secciones: [
          {
            clave: 'a',
            numeral: 'I',
            titulo: 'Con regla rota',
            orden: 1,
            paso: 1,
            visibleSi: 'esto no es una regla !!',
            bloques: [{ clave: 'x', tipo: 'rich_text', titulo: 'X', orden: 1 }],
          },
        ],
      };

      expect(validateTemplate(rota).join(' ')).toMatch(/Regla de visibilidad inválida/);
    });

    it('rechaza una plantilla sin secciones y una sección sin bloques', () => {
      expect(validateTemplate({ ...SER_FOR_002_V01, secciones: [] })).toHaveLength(1);

      const vacia: TemplateVersionDefinition = {
        ...SER_FOR_002_V01,
        secciones: [{ clave: 'a', numeral: 'I', titulo: 'Vacía', orden: 1, paso: 1, bloques: [] }],
      };
      expect(validateTemplate(vacia).join(' ')).toMatch(/no tiene bloques/);
    });
  });

  describe('SER-FOR-002 v01', () => {
    it('cubre las secciones del formato impreso con numeración correlativa', () => {
      const numerales = SER_FOR_002_V01.secciones.map((s) => s.numeral);
      expect(numerales).toEqual([
        'I',
        'II',
        'III',
        'IV',
        'V',
        'VI',
        'VII',
        'VIII',
        'IX',
        'X',
        'XI',
        'XII',
      ]);
    });

    it('cada bloque usa un tipo del catálogo de §11.2', () => {
      for (const seccion of SER_FOR_002_V01.secciones) {
        for (const bloque of seccion.bloques) {
          expect(BLOCK_TYPES).toContain(bloque.tipo);
        }
      }
    });

    it('los pasos del wizard van del 1 al 6 (§14.1)', () => {
      for (const seccion of SER_FOR_002_V01.secciones) {
        expect(seccion.paso).toBeGreaterThanOrEqual(1);
        expect(seccion.paso).toBeLessThanOrEqual(6);
      }
    });

    it('los trabajos se repiten: catorce «DESMONTAJE DE …» con una sola definición', () => {
      expect(isRepeatable('work_task')).toBe(true);
      expect(isRepeatable('header_meta')).toBe(false);
    });

    it('el número de informe se escribe a mano mientras D3 siga sin decidirse', () => {
      const identificacion = SER_FOR_002_V01.secciones[0]?.bloques[0];
      const campos = identificacion?.config?.['campos'] as { clave: string; tipo: string }[];
      const numero = campos.find((c) => c.clave === 'numeroInforme');
      expect(numero?.tipo).toBe('texto');
    });
  });
});

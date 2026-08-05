import { describe, expect, it } from 'vitest';
import {
  type AppliedSpec,
  calcOvalidad,
  evaluateMeasurement,
  proposeVerdict,
  requiresSupervisorJustification,
  resolveColumns,
} from './measurements';

/** Encaje de camisa inferior del MTU 20V4000C23 (informe OT898). */
const encajeInferior20V: AppliedSpec = {
  nominal: 193.0,
  tolInf: 0,
  tolSup: 0.08,
  unidad: 'mm',
  fuente: 'Informe OT898',
  provisional: true,
};

/** Encaje de camisa superior, común a ambos modelos. */
const encajeSuperior: AppliedSpec = {
  nominal: 196.0,
  tolInf: 0,
  tolSup: 0.15,
  unidad: 'mm',
  fuente: 'Informe OT746',
  provisional: true,
};

describe('evaluateMeasurement', () => {
  it('marca ok un valor cómodamente dentro del rango', () => {
    expect(evaluateMeasurement(193.02, encajeInferior20V)).toBe('ok');
  });

  it('marca ok el límite inferior exacto', () => {
    expect(evaluateMeasurement(193.0, encajeInferior20V)).toBe('ok');
  });

  it('marca alerta en el 10% superior del rango', () => {
    // rango 0.08 → umbral de alerta desde 193.072
    expect(evaluateMeasurement(193.075, encajeInferior20V)).toBe('alerta');
  });

  it('marca alerta el límite superior exacto (aún dentro de tolerancia)', () => {
    expect(evaluateMeasurement(193.08, encajeInferior20V)).toBe('alerta');
  });

  it('marca fuera un valor por encima de la tolerancia', () => {
    expect(evaluateMeasurement(193.09, encajeInferior20V)).toBe('fuera');
  });

  it('marca fuera un valor por debajo del nominal cuando tolInf es 0', () => {
    expect(evaluateMeasurement(192.99, encajeInferior20V)).toBe('fuera');
  });

  it('criterio de aceptación F2: +0.16 mm en encaje superior es fuera de tolerancia', () => {
    expect(evaluateMeasurement(196.16, encajeSuperior)).toBe('fuera');
    expect(evaluateMeasurement(196.15, encajeSuperior)).toBe('alerta');
  });
});

describe('calcOvalidad', () => {
  it('es el valor absoluto de la diferencia', () => {
    expect(calcOvalidad(0.02, 0.03)).toBeCloseTo(0.01, 10);
    expect(calcOvalidad(0.05, 0.01)).toBeCloseTo(0.04, 10);
  });
});

describe('resolveColumns', () => {
  const mtu20V = { cilindros: 20, apoyosBancada: 11, bancos: 2 };
  const mtu16V = { cilindros: 16, apoyosBancada: 9, bancos: 2 };

  it('criterio F2: el 20V4000C23 da 11 columnas de muñón de bancada', () => {
    const cols = resolveColumns({ tipo: 'modelo', campo: 'apoyosBancada' }, mtu20V);
    expect(cols).toHaveLength(11);
    expect(cols.at(-1)).toBe('11');
  });

  it('criterio F2: el 20V4000C23 da 10 columnas de biela por banco', () => {
    expect(resolveColumns({ tipo: 'modelo', campo: 'cilindrosPorBanco' }, mtu20V)).toHaveLength(10);
  });

  it('criterio F2: el 16V4000C21 da 9 y 8 columnas respectivamente', () => {
    expect(resolveColumns({ tipo: 'modelo', campo: 'apoyosBancada' }, mtu16V)).toHaveLength(9);
    expect(resolveColumns({ tipo: 'modelo', campo: 'cilindrosPorBanco' }, mtu16V)).toHaveLength(8);
  });

  it('respeta las columnas fijas', () => {
    const cols = resolveColumns({ tipo: 'fija', columnas: ['Piñón A', 'Piñón B'] }, mtu20V);
    expect(cols).toEqual(['Piñón A', 'Piñón B']);
  });
});

describe('proposeVerdict', () => {
  it('propone cambiar si hay al menos un valor fuera de tolerancia', () => {
    expect(proposeVerdict(['ok', 'alerta', 'fuera'])).toBe('cambiar');
  });

  it('propone reparar si solo hay alertas', () => {
    expect(proposeVerdict(['ok', 'alerta'])).toBe('reparar');
  });

  it('propone operativo si todo está dentro de tolerancia', () => {
    expect(proposeVerdict(['ok', 'ok'])).toBe('operativo');
  });
});

describe('requiresSupervisorJustification (RN-03)', () => {
  it('exige justificación cuando hay valores fuera de tolerancia', () => {
    expect(requiresSupervisorJustification(['ok', 'fuera'])).toBe(true);
  });

  it('no la exige cuando todo está dentro de tolerancia o en alerta', () => {
    expect(requiresSupervisorJustification(['ok', 'alerta'])).toBe(false);
  });
});

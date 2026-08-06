/**
 * Las diez plantillas de medición de §12.3.
 *
 * Son datos, no código: describen qué filas tiene cada grilla y de dónde salen
 * sus columnas. Ninguna lleva el número de columnas escrito — eso es el
 * hallazgo que gobierna F2 (§12.2): al elegir el motor por su número de serie,
 * la plataforma ya sabe que el 20V4000C23 pide once apoyos y el 16V4000C21
 * nueve. Un número aquí sería un número que se queda viejo con el siguiente
 * modelo de motor.
 *
 * `parametro` es la clave con la que se busca la tolerancia en `engineSpecs`.
 * Si no hay especificación cargada para ese parámetro y ese modelo, la grilla
 * se captura igual pero sin semáforo: mejor sin veredicto que con uno inventado.
 */

import type { MeasurementTemplate } from './measurements';

/** Filas de las grillas de encaje: longitudinal y transversal. */
const LONGITUDINAL_TRANSVERSAL = ['L', 'T'] as const;

/** Filas de las grillas de distribución. */
const AXIAL_CONTRAGOLPE = ['Axial', 'Contragolpe'] as const;

export const MEASUREMENT_TEMPLATES: readonly MeasurementTemplate[] = [
  {
    codigo: 'juego_axial_cigueñal',
    nombre: 'Juego axial del cigüeñal',
    forma: 'escalar',
    filas: ['Juego axial'],
    origenColumnas: { tipo: 'fija', columnas: ['Valor'] },
    parametro: 'juego_axial_cigueñal',
    unidad: 'mm',
  },
  {
    codigo: 'muñon_bancada',
    nombre: 'Muñón de bancada',
    forma: 'vector',
    filas: ['Ø'],
    origenColumnas: { tipo: 'modelo', campo: 'apoyosBancada' },
    parametro: 'muñon_bancada',
    unidad: 'mm',
  },
  {
    codigo: 'muñon_biela_a',
    nombre: 'Muñón de biela — banco A',
    forma: 'vector',
    filas: ['Ø'],
    origenColumnas: { tipo: 'modelo', campo: 'cilindrosPorBanco' },
    parametro: 'muñon_biela',
    unidad: 'mm',
  },
  {
    codigo: 'muñon_biela_b',
    nombre: 'Muñón de biela — banco B',
    forma: 'vector',
    filas: ['Ø'],
    origenColumnas: { tipo: 'modelo', campo: 'cilindrosPorBanco' },
    parametro: 'muñon_biela',
    unidad: 'mm',
  },
  {
    codigo: 'coaxialidad_cigueñal',
    nombre: 'Coaxialidad del cigüeñal',
    forma: 'vector',
    filas: ['Desviación'],
    // Los extremos son los apoyos de referencia contra los que se compara el
    // resto, y en el informe van rotulados así en vez de numerados.
    origenColumnas: { tipo: 'modelo', campo: 'apoyosBancada', etiquetaExtremos: 'APOYO' },
    parametro: 'coaxialidad_cigueñal',
    unidad: 'mm',
  },
  {
    codigo: 'encaje_camisa_superior',
    nombre: 'Encaje de camisa superior',
    forma: 'matriz',
    filas: [...LONGITUDINAL_TRANSVERSAL],
    origenColumnas: { tipo: 'modelo_por_banco', campo: 'cilindrosPorBanco' },
    parametro: 'encaje_camisa_superior',
    unidad: 'mm',
  },
  {
    codigo: 'encaje_camisa_inferior',
    nombre: 'Encaje de camisa inferior',
    forma: 'matriz',
    filas: [...LONGITUDINAL_TRANSVERSAL],
    origenColumnas: { tipo: 'modelo_por_banco', campo: 'cilindrosPorBanco' },
    parametro: 'encaje_camisa_inferior',
    unidad: 'mm',
  },
  {
    codigo: 'tunel_bancada',
    nombre: 'Túnel de bancada',
    forma: 'matriz',
    filas: ['a', 'b1', 'b2', 'Ovalidad'],
    // `Ovalidad = |b − a|` se calcula y nunca se pide (§12.4.2). Pedirla
    // permitiría que el informe dijera una cosa y los datos otra.
    filasCalculadas: ['Ovalidad'],
    origenColumnas: { tipo: 'modelo', campo: 'apoyosBancada' },
    parametro: 'taladro_tunel_bancada',
    unidad: 'mm',
  },
  {
    codigo: 'piñones_intermedios',
    nombre: 'Piñones intermedios',
    forma: 'matriz',
    filas: [...AXIAL_CONTRAGOLPE],
    origenColumnas: { tipo: 'fija', columnas: ['Piñón A', 'Piñón B'] },
    parametro: 'piñon_intermedio',
    unidad: 'mm',
  },
  {
    codigo: 'eje_levas',
    nombre: 'Eje de levas',
    forma: 'matriz',
    filas: [...AXIAL_CONTRAGOLPE],
    origenColumnas: { tipo: 'fija', columnas: ['Valor'] },
    parametro: 'eje_levas',
    unidad: 'mm',
  },
];

export function findMeasurementTemplate(codigo: string): MeasurementTemplate | undefined {
  return MEASUREMENT_TEMPLATES.find((t) => t.codigo === codigo);
}

/** Las plantillas cuyas dimensiones dependen del modelo de motor. */
export function templatesDependientesDelMotor(): readonly MeasurementTemplate[] {
  return MEASUREMENT_TEMPLATES.filter((t) => t.origenColumnas.tipo !== 'fija');
}

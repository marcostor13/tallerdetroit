/**
 * Motor de tolerancias — contrato compartido (§12 de la especificación).
 *
 * El backend es la fuente de verdad de la validación; el frontend usa estas
 * mismas funciones como espejo para dar retroalimentación inmediata. Al vivir
 * en `libs/shared`, ambos lados no pueden divergir.
 */

/** Estado de una celda: es el "semáforo" de §12.4.1. */
export type MeasurementState = 'ok' | 'alerta' | 'fuera';

/** Veredicto propuesto para el bloque a partir de sus mediciones (§12.4.4). */
export const COMPONENT_VERDICTS = ['operativo', 'reutilizable', 'reparar', 'cambiar'] as const;
export type ComponentVerdict = (typeof COMPONENT_VERDICTS)[number];

/**
 * Especificación aplicada. Se DENORMALIZA en cada medición capturada (§12.4.3):
 * si Calidad corrige la spec mañana, los informes ya emitidos conservan el
 * criterio con el que fueron evaluados.
 */
export interface AppliedSpec {
  readonly nominal: number;
  readonly tolInf: number;
  readonly tolSup: number;
  readonly unidad: string;
  readonly fuente: string;
  /** true mientras no se valide contra el manual del fabricante (decisión D1). */
  readonly provisional?: boolean;
}

/** Fracción superior del rango que dispara la alerta preventiva (🟡). */
export const WARNING_BAND = 0.1;

/**
 * Evalúa un valor medido contra su especificación.
 *
 * El rango válido es `[nominal + tolInf, nominal + tolSup]`.
 * Dentro de él, el 10% superior se marca como alerta preventiva.
 */
export function evaluateMeasurement(value: number, spec: AppliedSpec): MeasurementState {
  const min = spec.nominal + spec.tolInf;
  const max = spec.nominal + spec.tolSup;

  if (value < min || value > max) return 'fuera';

  const range = max - min;
  if (range <= 0) return 'ok';

  const warningThreshold = max - range * WARNING_BAND;
  return value >= warningThreshold ? 'alerta' : 'ok';
}

/** `Ovalidad = |b − a|` — campo calculado, nunca capturado (§12.4.2). */
export function calcOvalidad(a: number, b: number): number {
  return Math.abs(b - a);
}

/**
 * Forma de una plantilla de medición (§12.3).
 * `origenColumnas` indica de dónde sale el número de columnas: casi siempre del
 * modelo de motor, que es el hallazgo estructural del módulo.
 */
export type MeasurementShape = 'escalar' | 'vector' | 'matriz';

export type ColumnSource =
  | { readonly tipo: 'fija'; readonly columnas: readonly string[] }
  | { readonly tipo: 'modelo'; readonly campo: 'apoyosBancada' | 'cilindros' | 'cilindrosPorBanco' };

export interface MeasurementTemplate {
  readonly codigo: string;
  readonly nombre: string;
  readonly forma: MeasurementShape;
  readonly filas: readonly string[];
  /** Filas que se calculan y no se piden al usuario. */
  readonly filasCalculadas?: readonly string[];
  readonly origenColumnas: ColumnSource;
  readonly parametro: string;
  readonly unidad: string;
}

/** Datos del modelo de motor que resuelven las dimensiones de las grillas. */
export interface EngineGridDimensions {
  readonly cilindros: number;
  readonly apoyosBancada: number;
  readonly bancos: number;
}

/**
 * Resuelve las columnas de una grilla a partir del modelo de motor.
 *
 * Ejemplo real: el MTU 20V4000C23 (motor 5282011236) produce 11 columnas de
 * muñón de bancada y 10 de biela por banco; el 16V4000C21 (motor 5272012973),
 * 9 y 8. Sin configuración manual.
 */
export function resolveColumns(
  source: ColumnSource,
  engine: EngineGridDimensions,
): readonly string[] {
  if (source.tipo === 'fija') return source.columnas;

  const count =
    source.campo === 'apoyosBancada'
      ? engine.apoyosBancada
      : source.campo === 'cilindros'
        ? engine.cilindros
        : Math.floor(engine.cilindros / engine.bancos);

  return Array.from({ length: count }, (_, i) => String(i + 1));
}

/**
 * Propone el veredicto del bloque a partir de los estados de sus celdas.
 * Es una propuesta: el técnico puede cambiarla, pero queda registrada.
 */
export function proposeVerdict(states: readonly MeasurementState[]): ComponentVerdict {
  if (states.some((s) => s === 'fuera')) return 'cambiar';
  if (states.some((s) => s === 'alerta')) return 'reparar';
  return 'operativo';
}

/** RN-03: no se puede emitir con mediciones fuera de tolerancia sin justificación. */
export function requiresSupervisorJustification(states: readonly MeasurementState[]): boolean {
  return states.some((s) => s === 'fuera');
}

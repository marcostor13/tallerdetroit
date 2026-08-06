/**
 * Resolución de una grilla de medición concreta (§12.3, §12.4).
 *
 * Convierte una plantilla más un modelo de motor en la rejilla que el técnico
 * va a rellenar: qué filas, qué columnas, qué celdas se calculan solas y contra
 * qué tolerancia se evalúa cada valor.
 *
 * Vive en `libs/shared` porque los tres lados la necesitan idéntica: el wizard
 * para pintarla, el backend para validar lo que llega y el render para sacarla
 * en el PDF. Con tres implementaciones, un informe podría mostrar once columnas
 * en pantalla y diez en el documento.
 */

import {
  calcOvalidad,
  cylindersPerBank,
  evaluateMeasurement,
  proposeVerdict,
  resolveColumns,
  type AppliedSpec,
  type ComponentVerdict,
  type EngineGridDimensions,
  type MeasurementState,
  type MeasurementTemplate,
} from './measurements';

export interface CeldaMedicion {
  readonly fila: string;
  readonly columna: string;
  readonly valor: number | null;
  /** Se calcula a partir de otras celdas; no se pide al técnico. */
  readonly calculado: boolean;
  readonly estado: MeasurementState | null;
}

export interface GrillaResuelta {
  readonly codigo: string;
  readonly nombre: string;
  readonly unidad: string;
  readonly filas: readonly string[];
  readonly filasCalculadas: readonly string[];
  readonly columnas: readonly string[];
  readonly celdas: readonly CeldaMedicion[];
  /** Tolerancia aplicada, o `null` si no hay ninguna cargada para este motor. */
  readonly especificacion: AppliedSpec | null;
  readonly resumen: {
    readonly capturadas: number;
    readonly esperadas: number;
    readonly alertas: number;
    readonly fueraTolerancia: number;
    readonly veredicto: ComponentVerdict | null;
  };
}

/** Valores capturados, indexados por `fila|columna`. */
export type ValoresCapturados = Readonly<Record<string, number | null>>;

export function claveDeCelda(fila: string, columna: string): string {
  return `${fila}|${columna}`;
}

/**
 * Calcula la ovalidad de una columna del túnel de bancada.
 *
 * `Ovalidad = |b − a|` (§12.4.2). Con dos lecturas de `b` se toma la mayor
 * desviación: la pieza es tan ovalada como su peor eje, y quedarse con la media
 * escondería precisamente el defecto que se está buscando.
 */
function ovalidadDeColumna(valores: ValoresCapturados, columna: string): number | null {
  const a = valores[claveDeCelda('a', columna)];
  if (a === null || a === undefined) return null;

  const bs = ['b1', 'b2']
    .map((fila) => valores[claveDeCelda(fila, columna)])
    .filter((v): v is number => typeof v === 'number');

  if (!bs.length) return null;
  return Math.max(...bs.map((b) => calcOvalidad(a, b)));
}

/** Qué celdas calculadas sabe resolver esta plantilla. */
function calcularCelda(
  template: MeasurementTemplate,
  fila: string,
  columna: string,
  valores: ValoresCapturados,
): number | null {
  if (fila === 'Ovalidad') return ovalidadDeColumna(valores, columna);
  // Una fila marcada como calculada para la que no hay fórmula se queda vacía
  // en vez de inventar un número: en un informe técnico eso es preferible.
  return null;
}

/**
 * Construye la grilla.
 *
 * Sin `spec` la grilla se captura igual pero sin semáforo. Es deliberado: con
 * las tolerancias de §12.5 todavía provisionales (decisión D1), forzar una
 * evaluación con una especificación inventada sería peor que no evaluar.
 */
export function resolveGrid(
  template: MeasurementTemplate,
  engine: EngineGridDimensions,
  valores: ValoresCapturados = {},
  spec: AppliedSpec | null = null,
): GrillaResuelta {
  const columnas = resolveColumns(template.origenColumnas, engine);
  const filasCalculadas = template.filasCalculadas ?? [];

  const celdas: CeldaMedicion[] = [];
  const estados: MeasurementState[] = [];
  let capturadas = 0;

  for (const fila of template.filas) {
    const calculado = filasCalculadas.includes(fila);

    for (const columna of columnas) {
      const valor = calculado
        ? calcularCelda(template, fila, columna, valores)
        : (valores[claveDeCelda(fila, columna)] ?? null);

      // Las calculadas no cuentan como capturadas ni entran en el veredicto:
      // son una consecuencia de lo medido, no una medición más.
      if (valor !== null && !calculado) {
        capturadas++;
        if (spec) estados.push(evaluateMeasurement(valor, spec));
      }

      celdas.push({
        fila,
        columna,
        valor,
        calculado,
        estado: valor !== null && !calculado && spec ? evaluateMeasurement(valor, spec) : null,
      });
    }
  }

  const esperadas = (template.filas.length - filasCalculadas.length) * columnas.length;

  return {
    codigo: template.codigo,
    nombre: template.nombre,
    unidad: template.unidad,
    filas: template.filas,
    filasCalculadas,
    columnas,
    celdas,
    especificacion: spec,
    resumen: {
      capturadas,
      esperadas,
      alertas: estados.filter((e) => e === 'alerta').length,
      fueraTolerancia: estados.filter((e) => e === 'fuera').length,
      // Sin ninguna medición no hay veredicto que proponer: un «operativo» con
      // la grilla vacía sería una afirmación sin respaldo.
      veredicto: estados.length ? proposeVerdict(estados) : null,
    },
  };
}

/**
 * Cuántas celdas espera una plantilla para un motor dado.
 *
 * Sirve para avisar antes de emitir: una grilla a medias es un informe que dice
 * menos de lo que aparenta.
 */
export function celdasEsperadas(
  template: MeasurementTemplate,
  engine: EngineGridDimensions,
): number {
  const columnas = resolveColumns(template.origenColumnas, engine).length;
  const filas = template.filas.length - (template.filasCalculadas?.length ?? 0);
  return filas * columnas;
}

/**
 * Reparte un rango pegado desde Excel a partir de una celda (§12.4.5).
 *
 * El técnico copia una fila o un bloque de la hoja donde ya lo tenía y lo pega
 * aquí. Se recorre en el orden de lectura desde la celda activa, y lo que se
 * salga de la grilla se descarta en silencio: pegar un rango más ancho no debe
 * escribir en columnas que no existen.
 */
export function distribuirPegado(
  texto: string,
  grilla: Pick<GrillaResuelta, 'filas' | 'filasCalculadas' | 'columnas'>,
  desde: { readonly fila: string; readonly columna: string },
): Record<string, number> {
  const filasEditables = grilla.filas.filter((f) => !grilla.filasCalculadas.includes(f));
  const filaInicial = filasEditables.indexOf(desde.fila);
  const columnaInicial = grilla.columnas.indexOf(desde.columna);
  if (filaInicial < 0 || columnaInicial < 0) return {};

  const resultado: Record<string, number> = {};

  const lineas = texto
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((l) => l.trim().length > 0);

  lineas.forEach((linea, df) => {
    const fila = filasEditables[filaInicial + df];
    if (!fila) return;

    // Excel separa por tabuladores; se admite también el punto y coma por si
    // el rango llegó pegado desde un CSV.
    linea.split(/[\t;]/).forEach((bruto, dc) => {
      const columna = grilla.columnas[columnaInicial + dc];
      if (!columna) return;

      // La coma decimal es lo que produce un Excel en español.
      const valor = Number(bruto.trim().replace(',', '.'));
      if (bruto.trim() === '' || Number.isNaN(valor)) return;

      resultado[claveDeCelda(fila, columna)] = valor;
    });
  });

  return resultado;
}

/** Reexportado por comodidad de quien resuelve grillas. */
export { cylindersPerBank };

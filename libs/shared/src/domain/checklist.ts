/**
 * Inventario de desarmado (SER-T-FOR-002, decisión D4).
 *
 * D4 quedó resuelta en **sección dentro del mismo informe**: un bloque
 * `checklist` más, que sale en el mismo PDF, comparte número y recorre el mismo
 * ciclo de aprobación. No es un documento independiente.
 *
 * Importa por qué: como documento aparte, el inventario se firma en un sitio y
 * el informe en otro, y acaban contando cosas distintas del mismo motor. Dentro
 * del informe hay una sola versión de lo que se encontró al abrirlo.
 */

/** En qué estado llegó cada pieza. */
export const CHECKLIST_STATES = ['ok', 'falta', 'averiado', 'no_aplica'] as const;
export type ChecklistState = (typeof CHECKLIST_STATES)[number];

/** Cómo se llama cada estado en el informe impreso. */
export const CHECKLIST_STATE_LABEL: Record<ChecklistState, string> = {
  ok: 'Conforme',
  falta: 'Falta',
  averiado: 'Averiado',
  no_aplica: 'No aplica',
};

export interface ChecklistItem {
  readonly clave: string;
  readonly denominacion: string;
  /** Para agrupar en el documento: `bloque`, `culatas`, `distribución`. */
  readonly grupo?: string | null;
  /** Cuántas se esperan. Se deriva del motor cuando es variable. */
  readonly cantidadEsperada?: number | null;
  readonly cantidadDerivadaDe?: 'cilindros' | 'apoyosBancada' | 'cilindrosPorBanco' | null;
}

export interface ChecklistCapturado {
  readonly clave: string;
  readonly estado: ChecklistState;
  readonly cantidad?: number | null;
  readonly observacion?: string | null;
}

export interface FilaDeChecklist extends ChecklistItem {
  readonly estado: ChecklistState | null;
  readonly cantidad: number | null;
  readonly cantidadEsperadaResuelta: number | null;
  readonly observacion: string | null;
  /** Falta, está averiada o no cuadra la cantidad. */
  readonly requiereAtencion: boolean;
}

export interface ResumenDeChecklist {
  readonly total: number;
  readonly capturados: number;
  readonly conformes: number;
  readonly faltantes: number;
  readonly averiados: number;
  readonly noAplica: number;
  /** Ítems que exigen que alguien mire antes de emitir. */
  readonly requierenAtencion: number;
}

export interface ChecklistResuelto {
  readonly filas: readonly FilaDeChecklist[];
  readonly resumen: ResumenDeChecklist;
}

/**
 * Dimensiones del motor que resuelven las cantidades esperadas.
 *
 * Admiten `undefined` explícito: quien llama viene de un informe donde el motor
 * puede no estar resuelto todavía, y con `exactOptionalPropertyTypes` marcarlo
 * opcional no basta.
 */
export interface DimensionesDeMotor {
  readonly cilindros?: number | undefined;
  readonly apoyosBancada?: number | undefined;
  readonly bancos?: number | undefined;
}

function cantidadEsperada(item: ChecklistItem, motor: DimensionesDeMotor): number | null {
  if (item.cantidadDerivadaDe) {
    const cilindros = motor.cilindros ?? 0;
    const bancos = motor.bancos ?? 2;

    // Un 20V lleva veinte pistones y un 16V dieciséis: la cantidad no puede
    // estar escrita en el catálogo.
    if (item.cantidadDerivadaDe === 'cilindros') return cilindros || null;
    if (item.cantidadDerivadaDe === 'apoyosBancada') return motor.apoyosBancada ?? null;
    return cilindros ? Math.floor(cilindros / bancos) : null;
  }

  return item.cantidadEsperada ?? null;
}

/**
 * Cruza el catálogo de ítems con lo capturado.
 *
 * Un ítem sin capturar queda con `estado: null`, no como conforme. Dar por
 * bueno lo que nadie ha mirado es justo lo que el inventario existe para
 * evitar: al desarmar un motor, lo que falta se descubre ahora o se descubre
 * al montarlo, tres semanas después.
 */
export function resolveChecklist(
  items: readonly ChecklistItem[],
  capturado: readonly ChecklistCapturado[],
  motor: DimensionesDeMotor = {},
): ChecklistResuelto {
  const porClave = new Map(capturado.map((c) => [c.clave, c]));

  const filas: FilaDeChecklist[] = items.map((item) => {
    const dato = porClave.get(item.clave);
    const esperada = cantidadEsperada(item, motor);
    const cantidad = dato?.cantidad ?? null;
    const estado = dato?.estado ?? null;

    // La cantidad solo se contrasta si se sabe cuántas debía haber y el ítem
    // se dio por conforme: un «averiado» ya está señalado por sí mismo.
    const cantidadNoCuadra =
      estado === 'ok' && esperada !== null && cantidad !== null && cantidad !== esperada;

    return {
      ...item,
      estado,
      cantidad,
      cantidadEsperadaResuelta: esperada,
      observacion: dato?.observacion ?? null,
      requiereAtencion: estado === 'falta' || estado === 'averiado' || cantidadNoCuadra,
    };
  });

  const cuenta = (estado: ChecklistState) => filas.filter((f) => f.estado === estado).length;

  return {
    filas,
    resumen: {
      total: filas.length,
      capturados: filas.filter((f) => f.estado !== null).length,
      conformes: cuenta('ok'),
      faltantes: cuenta('falta'),
      averiados: cuenta('averiado'),
      noAplica: cuenta('no_aplica'),
      requierenAtencion: filas.filter((f) => f.requiereAtencion).length,
    },
  };
}

/**
 * Qué impide emitir con este checklist.
 *
 * Faltar piezas o encontrarlas averiadas **no** bloquea: es precisamente lo que
 * el inventario documenta, y un motor llega como llega. Lo que bloquea es
 * dejarlo a medias, porque entonces el informe afirma menos de lo que aparenta.
 */
export function checklistIncompleto(resuelto: ChecklistResuelto): number {
  return resuelto.resumen.total - resuelto.resumen.capturados;
}

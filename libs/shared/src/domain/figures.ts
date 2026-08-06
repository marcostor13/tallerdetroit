/**
 * Numeración de figuras (RN-06).
 *
 * En el Word actual, las figuras se numeran a mano. Cuando el técnico mueve un
 * bloque —cosa que hace constantemente, porque el orden de los trabajos se
 * decide al final— la numeración se descuadra y el texto acaba diciendo «ver
 * Fig. 12» apuntando a otra foto. El criterio de F1 es que eso deje de pasar en
 * pantalla y en el PDF a la vez.
 *
 * Por eso el número **no se guarda como dato editable**: se deriva del orden. Un
 * número almacenado es un número que se puede quedar viejo; uno derivado no.
 */

export interface NumerableFoto {
  /** Identificador estable de la foto, para casar el resultado con el original. */
  readonly id: string;
}

export interface NumerableBloque {
  readonly id: string;
  readonly orden: number;
  /** Un bloque oculto por las reglas de §11.3 no aporta figuras al documento. */
  readonly visible?: boolean;
  readonly fotos?: readonly NumerableFoto[];
}

export interface FiguraNumerada {
  readonly bloqueId: string;
  readonly fotoId: string;
  readonly numero: number;
  /** Etiqueta ya formateada: `Fig.07`. */
  readonly etiqueta: string;
}

/** Ancho del relleno con ceros. `Fig.07`, no `Fig.7`. */
const ANCHO = 2;

export function formatFigureLabel(numero: number): string {
  return `Fig.${String(numero).padStart(ANCHO, '0')}`;
}

/**
 * Recorre los bloques en su orden actual y numera las fotos de forma correlativa
 * en todo el informe.
 *
 * Los bloques ocultos se saltan sin consumir número: si una sección no sale en
 * el documento, sus figuras tampoco, y dejar huecos en la numeración sería un
 * defecto visible en un formato controlado.
 */
export function numberFigures(bloques: readonly NumerableBloque[]): FiguraNumerada[] {
  const figuras: FiguraNumerada[] = [];
  let siguiente = 1;

  const ordenados = [...bloques].sort((a, b) => a.orden - b.orden);

  for (const bloque of ordenados) {
    if (bloque.visible === false) continue;

    for (const foto of bloque.fotos ?? []) {
      figuras.push({
        bloqueId: bloque.id,
        fotoId: foto.id,
        numero: siguiente,
        etiqueta: formatFigureLabel(siguiente),
      });
      siguiente++;
    }
  }

  return figuras;
}

/** Índice `fotoId → número`, que es como lo consultan la vista previa y el render. */
export function figureNumbersById(bloques: readonly NumerableBloque[]): Map<string, number> {
  return new Map(numberFigures(bloques).map((f) => [f.fotoId, f.numero]));
}

/**
 * Mueve un bloque de posición y devuelve la lista con los `orden` ya
 * recalculados.
 *
 * Se reasignan todos los órdenes en vez de intercalar decimales: un orden
 * entero y contiguo es lo que espera el render, y ahorra que la lista degenere
 * tras muchas reordenaciones.
 */
export function moveBlock<T extends { orden: number }>(
  bloques: readonly T[],
  desde: number,
  hasta: number,
): T[] {
  const ordenados = [...bloques].sort((a, b) => a.orden - b.orden);

  if (desde < 0 || desde >= ordenados.length || hasta < 0 || hasta >= ordenados.length) {
    return ordenados.map((b, i) => ({ ...b, orden: i + 1 }));
  }

  const [movido] = ordenados.splice(desde, 1);
  ordenados.splice(hasta, 0, movido as T);

  return ordenados.map((b, i) => ({ ...b, orden: i + 1 }));
}

/**
 * Números de informe y de orden de trabajo.
 *
 * La decisión D3 quedó resuelta en **ingreso manual**: el negocio no ha fijado
 * la semántica de cada segmento, así que no hay generador de correlativos en F1.
 * Lo que sí hay es normalización y unicidad.
 *
 * El orden importa. La unicidad es una regla dura: dos informes con el mismo
 * número son dos documentos controlados indistinguibles, y eso es un defecto de
 * trazabilidad, no una molestia. La validación de formato es deliberadamente
 * **permisiva**: como la convención no está confirmada, una expresión regular
 * estricta rechazaría números legítimos que nadie nos ha enseñado todavía —
 * y ese error es peor, porque bloquea al técnico frente a un número correcto.
 *
 * Patrones observados en los informes reales:
 *
 *   ITS-T-E-26-003-0898     informe de taller / evaluación
 *   ITS-C-G-25-0001-001398  informe de campo / grupo electrógeno
 *   LIM-TAL-000898          orden de trabajo de taller
 *   LIM-SCA-001398          orden de trabajo de campo
 */

/**
 * Deja el número en su forma canónica: mayúsculas, sin espacios sobrantes y con
 * los guiones limpios.
 *
 * Sin esto, `lim-tal-000898` y `LIM-TAL-000898` conviven en la base como dos
 * órdenes distintas y el índice único no lo impide. El daño no es cosmético:
 * son dos documentos con el mismo número que la plataforma da por diferentes.
 */
export function normalizeDocumentNumber(raw: string): string {
  return (
    raw
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '')
      // Guiones tipográficos: se cuelan al copiar y pegar desde Word.
      .replace(/[‐-―]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
  );
}

export interface DocumentNumberCheck {
  readonly valido: boolean;
  readonly normalizado: string;
  readonly motivo?: string;
}

/** Longitud a partir de la cual el número deja de parecer un número. */
const MAX_LONGITUD = 40;

/**
 * Comprobación de forma común a informes y órdenes.
 *
 * Solo rechaza lo que no puede ser un número de documento bajo ninguna
 * convención: vacío, con caracteres que no son alfanuméricos ni guiones, de un
 * solo segmento, o sin ningún dígito. Un correlativo sin dígitos no es un
 * correlativo.
 */
function comprobar(raw: string, minimoSegmentos: number): DocumentNumberCheck {
  const normalizado = normalizeDocumentNumber(raw ?? '');

  if (!normalizado) {
    return { valido: false, normalizado, motivo: 'El número no puede estar vacío.' };
  }

  if (normalizado.length > MAX_LONGITUD) {
    return {
      valido: false,
      normalizado,
      motivo: `El número no puede pasar de ${MAX_LONGITUD} caracteres.`,
    };
  }

  if (!/^[A-Z0-9-]+$/.test(normalizado)) {
    return {
      valido: false,
      normalizado,
      motivo: 'Solo se admiten letras, números y guiones.',
    };
  }

  const segmentos = normalizado.split('-');
  if (segmentos.length < minimoSegmentos) {
    return {
      valido: false,
      normalizado,
      motivo: `Se esperan al menos ${minimoSegmentos} segmentos separados por guion, como «LIM-TAL-000898».`,
    };
  }

  if (!/\d/.test(normalizado)) {
    return { valido: false, normalizado, motivo: 'Falta el correlativo: no hay ningún dígito.' };
  }

  return { valido: true, normalizado };
}

/** `LIM-TAL-000898` — ciudad, unidad y correlativo. */
export function checkWorkOrderNumber(raw: string): DocumentNumberCheck {
  return comprobar(raw, 3);
}

/** `ITS-T-E-26-003-0898` — prefijo, sede, tipo, año, serie y correlativo. */
export function checkReportNumber(raw: string): DocumentNumberCheck {
  return comprobar(raw, 4);
}

/**
 * Sugiere el siguiente correlativo a partir del último visto.
 *
 * No es un generador: hasta que el negocio confirme D3 nadie puede afirmar que
 * el siguiente número sea este. Sirve para pre-rellenar el campo y ahorrarle al
 * técnico teclear catorce caracteres, dejándole cambiarlo. Devuelve `null` si el
 * número no termina en dígitos, porque entonces no hay nada que suponer.
 */
export function suggestNextNumber(ultimo: string): string | null {
  const normalizado = normalizeDocumentNumber(ultimo ?? '');
  const match = /^(.*?)(\d+)$/.exec(normalizado);
  if (!match) return null;

  const [, prefijo, digitos] = match as unknown as [string, string, string];
  const siguiente = String(Number(digitos) + 1);

  // Se conserva el relleno con ceros: `000898` → `000899`, no `899`.
  return prefijo + siguiente.padStart(digitos.length, '0');
}

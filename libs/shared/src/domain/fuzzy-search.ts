/**
 * Búsqueda tolerante a errores de escritura (§13.3.2).
 *
 * Nace de un typo real: los informes traen `KOMATZU` donde debería decir
 * `KOMATSU`. Si al técnico no le aparece lo que busca, vuelve al texto libre y
 * el maestro deja de servir para nada — que es exactamente lo que hay que evitar.
 *
 * Vive en `libs/shared` para que el frontend pueda ordenar las sugerencias que
 * ya tiene en caché sin volver a preguntar al servidor (modo offline, §18).
 */

/** Quita tildes, pasa a minúsculas y colapsa espacios. */
export function normalize(text: string): string {
  return (
    text
      .normalize('NFD')
      // Marcas diacríticas combinantes, que NFD separa de su letra base.
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Distancia de Levenshtein con corte temprano.
 *
 * Si supera `maxDistance` deja de calcular y devuelve `maxDistance + 1`: al
 * filtrar cientos de registros por pulsación, terminar antes importa.
 */
export function editDistance(a: string, b: string, maxDistance = Infinity): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;

  let anterior = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    const actual = [i];
    let mejorDeLaFila = i;

    for (let j = 1; j <= b.length; j++) {
      const coste = a[i - 1] === b[j - 1] ? 0 : 1;
      const valor = Math.min(
        (actual[j - 1] ?? 0) + 1,
        (anterior[j] ?? 0) + 1,
        (anterior[j - 1] ?? 0) + coste,
      );
      actual.push(valor);
      if (valor < mejorDeLaFila) mejorDeLaFila = valor;
    }

    // Ninguna celda de la fila baja del umbral: el resultado ya no puede mejorar.
    if (mejorDeLaFila > maxDistance) return maxDistance + 1;
    anterior = actual;
  }

  return anterior[b.length] ?? maxDistance + 1;
}

/**
 * Cuánto se parece la consulta al candidato, de 0 a 1.
 *
 * El orden de las reglas refleja lo que espera quien escribe: primero lo
 * idéntico, luego lo que empieza igual, después lo que lo contiene y solo al
 * final lo que se parece con erratas.
 */
export function similarity(query: string, candidate: string): number {
  const q = normalize(query);
  const c = normalize(candidate);

  if (!q || !c) return 0;
  if (q === c) return 1;
  if (c.startsWith(q)) return 0.9;
  if (c.includes(q)) return 0.8;

  const palabras = c.split(/[\s.\-_/]+/).filter(Boolean);

  // Alguna palabra del candidato empieza por la consulta: «toq» → «SPCC. TOQUEPALA».
  if (palabras.some((palabra) => palabra.startsWith(q))) return 0.75;

  /** Parecido por erratas entre dos textos, 0 si se pasa del umbral. */
  const porErratas = (a: string, b: string): number => {
    // Tolerancia proporcional: una errata en algo corto pesa más que en algo largo.
    const maxDistancia = Math.max(1, Math.floor(Math.max(a.length, b.length) * 0.34));
    const distancia = editDistance(a, b, maxDistancia);
    if (distancia > maxDistancia) return 0;
    return Math.max(0, 1 - distancia / Math.max(a.length, b.length));
  };

  // Contra el texto completo.
  const global = porErratas(q, c);

  // Y contra cada palabra por separado: «TOQEPALA» debe encontrar
  // «SPCC. TOQUEPALA», donde la distancia contra la cadena entera es enorme
  // pero contra la palabra correcta es de una sola letra.
  const porPalabra =
    palabras.length > 1 ? Math.max(0, ...palabras.map((p) => porErratas(q, p))) : 0;

  // Se penaliza frente a las coincidencias exactas: encontrar por errata nunca
  // debe adelantar a lo que coincide de verdad.
  return 0.7 * Math.max(global, porPalabra);
}

export interface FuzzyMatch<T> {
  readonly item: T;
  readonly score: number;
}

/**
 * Ordena candidatos por parecido con la consulta.
 *
 * `fields` puede devolver varios textos por elemento (razón social y nombre
 * corto, por ejemplo); se queda con el mejor de ellos.
 */
export function fuzzySearch<T>(
  query: string,
  items: readonly T[],
  fields: (item: T) => readonly (string | null | undefined)[],
  options: { readonly limit?: number; readonly threshold?: number } = {},
): FuzzyMatch<T>[] {
  const { limit = 20, threshold = 0.35 } = options;
  if (!query.trim()) return items.slice(0, limit).map((item) => ({ item, score: 1 }));

  return items
    .map((item) => ({
      item,
      score: Math.max(
        0,
        ...fields(item)
          .filter((f): f is string => typeof f === 'string' && f.length > 0)
          .map((f) => similarity(query, f)),
      ),
    }))
    .filter((m) => m.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

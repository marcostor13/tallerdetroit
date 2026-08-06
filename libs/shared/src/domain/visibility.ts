/**
 * Evaluador de las reglas de visibilidad condicional de las plantillas (§11.3).
 *
 * Las reglas vienen escritas por Calidad dentro de la definición de la
 * plantilla, en texto:
 *
 *   equipo.categoria == 'grupo_electrogeno'
 *   motor.tieneCac == true
 *   intervencion.codigo in ['QL4', 'OVERHAUL']
 *   informe.tercerizados.length > 0
 *
 * Hay dos razones para escribir un evaluador propio en vez de usar `eval` o una
 * librería de expresiones:
 *
 * 1. Seguridad. La regla llega desde la base de datos. `eval` convertiría a
 *    quien pueda editar una plantilla en dueño del proceso de Node.
 * 2. Paridad. La misma regla decide qué se muestra en el wizard y qué se valida
 *    al emitir. Si el frontend y el backend no coinciden, el técnico rellena
 *    campos que el servidor ignora, o al revés: le exigen uno que nunca vio.
 *    Con un único evaluador en `libs/shared` no hay dos verdades.
 *
 * La gramática es deliberadamente pequeña. Si una plantilla necesita más que
 * esto, el problema es de la plantilla.
 */

/** Contexto contra el que se evalúa: `{ equipo: {...}, motor: {...}, … }`. */
export type VisibilityContext = Record<string, unknown>;

const OPERADORES = ['==', '!=', '>=', '<=', '>', '<', 'not in', 'in'] as const;
type Operador = (typeof OPERADORES)[number];

export class VisibilityRuleError extends Error {
  constructor(regla: string, motivo: string) {
    super(`Regla de visibilidad inválida «${regla}»: ${motivo}`);
    this.name = 'VisibilityRuleError';
  }
}

/**
 * Recorre `informe.tercerizados.length` sobre el contexto.
 *
 * `length` se resuelve sobre arrays y textos porque las reglas reales lo usan
 * («muéstrame la sección solo si hay tercerizados»).
 */
function resolverRuta(ruta: string, contexto: VisibilityContext): unknown {
  let actual: unknown = contexto;

  for (const tramo of ruta.split('.')) {
    if (actual === null || actual === undefined) return undefined;

    if (tramo === 'length' && (Array.isArray(actual) || typeof actual === 'string')) {
      actual = actual.length;
      continue;
    }

    if (typeof actual !== 'object') return undefined;
    actual = (actual as Record<string, unknown>)[tramo];
  }

  return actual;
}

/** Literal del lado derecho: texto entrecomillado, número, booleano, null o lista. */
function parsearLiteral(texto: string, regla: string): unknown {
  const t = texto.trim();

  if (t.startsWith('[')) {
    if (!t.endsWith(']')) throw new VisibilityRuleError(regla, 'falta cerrar la lista');
    const interior = t.slice(1, -1).trim();
    if (!interior) return [];
    // Se parte respetando comillas: `['MOTOR, MTU']` es un solo elemento.
    return partirPor(interior, ',').map((elemento) => parsearLiteral(elemento, regla));
  }

  if ((t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"'))) {
    if (t.length < 2) throw new VisibilityRuleError(regla, 'falta cerrar la comilla');
    return t.slice(1, -1);
  }

  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t === 'null') return null;

  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);

  throw new VisibilityRuleError(regla, `no se entiende el valor «${t}»`);
}

/**
 * Compara dos valores ya resueltos.
 *
 * La igualdad es estricta a propósito: `motor.cilindros == '20'` debe ser falso
 * si el motor guarda el número 20. Igualar tipos distintos escondería un error
 * de la plantilla en lugar de mostrarlo.
 */
function comparar(izquierda: unknown, operador: Operador, derecha: unknown): boolean {
  switch (operador) {
    case '==':
      return izquierda === derecha;
    case '!=':
      return izquierda !== derecha;
    case 'in':
      return Array.isArray(derecha) && derecha.includes(izquierda);
    case 'not in':
      return Array.isArray(derecha) && !derecha.includes(izquierda);
    default: {
      // Las desigualdades solo tienen sentido entre números.
      if (typeof izquierda !== 'number' || typeof derecha !== 'number') return false;
      if (operador === '>') return izquierda > derecha;
      if (operador === '<') return izquierda < derecha;
      if (operador === '>=') return izquierda >= derecha;
      return izquierda <= derecha;
    }
  }
}

/** Divide por un separador de nivel superior, respetando comillas y corchetes. */
function partirPor(texto: string, separador: string): string[] {
  const partes: string[] = [];
  let actual = '';
  let comilla: string | null = null;
  let profundidad = 0;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i] as string;

    if (comilla) {
      actual += c;
      if (c === comilla) comilla = null;
      continue;
    }
    if (c === "'" || c === '"') {
      comilla = c;
      actual += c;
      continue;
    }
    if (c === '[') profundidad++;
    if (c === ']') profundidad--;

    if (profundidad === 0 && texto.startsWith(separador, i)) {
      partes.push(actual);
      actual = '';
      i += separador.length - 1;
      continue;
    }
    actual += c;
  }

  partes.push(actual);
  return partes;
}

/** Una comparación suelta: `ruta operador literal`. */
function evaluarComparacion(regla: string, contexto: VisibilityContext): boolean {
  const texto = regla.trim();

  // Una ruta a solas es una comprobación de veracidad: `motor.tieneCac`.
  for (const operador of OPERADORES) {
    const partes = partirPor(texto, ` ${operador} `);
    if (partes.length !== 2) continue;

    const [ruta, literal] = partes as [string, string];
    const izquierda = resolverRuta(ruta.trim(), contexto);
    const derecha = parsearLiteral(literal, regla);
    return comparar(izquierda, operador, derecha);
  }

  if (/^[A-Za-z_][\w.]*$/.test(texto)) {
    return Boolean(resolverRuta(texto, contexto));
  }

  throw new VisibilityRuleError(regla, 'no se reconoce ningún operador');
}

/**
 * Evalúa una regla completa, con `&&` y `||`.
 *
 * `||` se parte antes que `&&` para que `a && b || c` signifique
 * `(a && b) || c`, que es la precedencia que espera cualquiera que la escriba.
 */
export function evaluateVisibility(regla: string, contexto: VisibilityContext): boolean {
  const texto = regla.trim();
  if (!texto) throw new VisibilityRuleError(regla, 'está vacía');

  const alternativas = partirPor(texto, '||');
  if (alternativas.length > 1) {
    return alternativas.some((parte) => evaluateVisibility(parte, contexto));
  }

  const conjunciones = partirPor(texto, '&&');
  if (conjunciones.length > 1) {
    return conjunciones.every((parte) => evaluateVisibility(parte, contexto));
  }

  return evaluarComparacion(texto, contexto);
}

/**
 * Igual que `evaluateVisibility`, pero una regla rota no esconde la sección.
 *
 * Ante una plantilla mal escrita se prefiere mostrar de más: que el técnico vea
 * una sección que no le tocaba es un estorbo; que no vea una que sí le tocaba
 * es un informe incompleto que nadie detecta hasta que ya está emitido.
 */
export function isVisible(regla: string | null | undefined, contexto: VisibilityContext): boolean {
  if (!regla?.trim()) return true;
  try {
    return evaluateVisibility(regla, contexto);
  } catch {
    return true;
  }
}

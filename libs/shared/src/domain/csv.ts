/**
 * Lectura de CSV para la carga masiva de maestros (§13.2).
 *
 * Se escribe en lugar de traer una librería porque el problema real no es
 * separar por comas —eso son tres líneas— sino lo que llega de verdad: el
 * negocio exporta desde Excel en español, y eso significa punto y coma como
 * separador, BOM al principio del archivo, comillas alrededor de los campos que
 * contienen el separador, y saltos de línea dentro de una celda.
 *
 * Un `split(',')` se traga «TECNOLÓGICA DE ALIMENTOS, S.A.» y parte el nombre
 * del cliente en dos columnas. Ese error no salta: entra en la base y aparece
 * meses después en un informe.
 */

/** Delimitadores que se prueban, en orden de probabilidad para un Excel en español. */
const DELIMITADORES = [';', ',', '\t'];

/**
 * Deduce el separador contando cuál produce el mismo número de columnas en las
 * primeras filas. El que sea constante es el bueno.
 */
export function detectDelimiter(texto: string): string {
  const lineas = texto.split(/\r?\n/).filter(Boolean).slice(0, 5);
  if (!lineas.length) return ',';

  let mejor = ',';
  let mejorPuntuacion = -1;

  for (const delimitador of DELIMITADORES) {
    const cuentas = lineas.map((l) => l.split(delimitador).length);
    const primera = cuentas[0] ?? 1;
    if (primera < 2) continue;

    // Constante entre líneas y con más columnas: mejor candidato.
    const constante = cuentas.every((c) => c === primera);
    const puntuacion = (constante ? 100 : 0) + primera;

    if (puntuacion > mejorPuntuacion) {
      mejorPuntuacion = puntuacion;
      mejor = delimitador;
    }
  }

  return mejor;
}

/**
 * Divide respetando comillas dobles, incluidas las escapadas (`""`) y los saltos
 * de línea dentro de una celda.
 */
export function parseCsv(texto: string, delimitador?: string): string[][] {
  // El BOM que Excel escribe al guardar en UTF-8 se pega a la primera cabecera
  // y deja una columna llamada «U+FEFFrazonSocial» que no casa con nada.
  const limpio = texto.replace(/^\uFEFF/, '');
  const sep = delimitador ?? detectDelimiter(limpio);

  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = '';
  let entreComillas = false;

  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i] as string;

    if (entreComillas) {
      if (c === '"') {
        if (limpio[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          entreComillas = false;
        }
      } else {
        campo += c;
      }
      continue;
    }

    if (c === '"') {
      entreComillas = true;
    } else if (c === sep) {
      fila.push(campo);
      campo = '';
    } else if (c === '\n') {
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = '';
    } else if (c !== '\r') {
      campo += c;
    }
  }

  if (campo || fila.length) {
    fila.push(campo);
    filas.push(fila);
  }

  // Excel deja una línea vacía al final casi siempre.
  return filas.filter((f) => f.some((c) => c.trim()));
}

export interface FilaImportada {
  /** Número de fila del archivo, contando la cabecera. Es lo que el usuario ve. */
  readonly linea: number;
  readonly datos: Record<string, string>;
}

/** Convierte el CSV en registros, usando la primera fila como cabecera. */
export function csvToRecords(texto: string, delimitador?: string): FilaImportada[] {
  const filas = parseCsv(texto, delimitador);
  const [cabecera, ...resto] = filas;
  if (!cabecera) return [];

  const columnas = cabecera.map((c) => c.trim());

  return resto.map((fila, i) => ({
    linea: i + 2,
    datos: Object.fromEntries(
      columnas.map((columna, j) => [columna, (fila[j] ?? '').trim()]).filter(([c]) => c),
    ),
  }));
}

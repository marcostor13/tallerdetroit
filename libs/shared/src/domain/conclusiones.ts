/**
 * Veredicto de un bloque y redacción de las conclusiones (§12.4.4).
 *
 * El patrón textual sale de los informes reales:
 *
 *   «El cigüeñal se encuentra operativo. (Pulir cigüeñal).»
 *
 * Es una **propuesta**, no una conclusión. El técnico la edita o la borra; lo
 * que aporta es no tener que redactar catorce frases iguales a mano, que es de
 * donde vienen las erratas y las omisiones del formato actual.
 */

import { proposeVerdict, type ComponentVerdict, type MeasurementState } from './measurements';

/** Resumen de una grilla, tal como queda guardado en el bloque. */
export interface ResumenDeGrilla {
  readonly nombre?: string | null;
  readonly resumen?: {
    readonly capturadas?: number;
    readonly alertas?: number;
    readonly fueraTolerancia?: number;
    readonly veredicto?: ComponentVerdict | null;
  } | null;
}

/** Cómo de grave es cada veredicto. Manda el peor de todos. */
const GRAVEDAD: Record<ComponentVerdict, number> = {
  operativo: 0,
  reutilizable: 1,
  reparar: 2,
  cambiar: 3,
};

/**
 * Veredicto del bloque a partir de todas sus grillas.
 *
 * Manda el peor: un componente con diez grillas correctas y una fuera de
 * tolerancia no está operativo. Promediar o quedarse con la mayoría escondería
 * justo el defecto que el informe existe para documentar.
 *
 * Sin ninguna grilla evaluada devuelve `null`. Proponer «operativo» porque no
 * hay datos sería afirmar algo que nadie ha comprobado.
 */
export function verdictOfBlock(grillas: readonly ResumenDeGrilla[]): ComponentVerdict | null {
  const veredictos = grillas
    .map((g) => g.resumen?.veredicto)
    .filter((v): v is ComponentVerdict => Boolean(v));

  if (!veredictos.length) return null;

  return veredictos.reduce((peor, actual) => (GRAVEDAD[actual] > GRAVEDAD[peor] ? actual : peor));
}

/** Igual, pero partiendo de los estados sueltos de las celdas. */
export function verdictOfStates(estados: readonly MeasurementState[]): ComponentVerdict | null {
  return estados.length ? proposeVerdict(estados) : null;
}

export interface ConclusionPropuesta {
  /** Bloque del que sale, para poder llevar al técnico hasta él. */
  readonly bloqueId: string;
  readonly componente: string;
  readonly veredicto: ComponentVerdict;
  readonly accion: string | null;
  readonly texto: string;
  /** Cuántas mediciones se salieron. Ordena las propuestas por gravedad. */
  readonly fueraTolerancia: number;
}

/**
 * Cómo se dice cada veredicto dentro de la frase.
 *
 * No basta con poner la clave: `operativo` concuerda en género y número, pero
 * `reparar` y `cambiar` son verbos y «se encuentra reparar» no es español. Esto
 * acaba impreso en un documento que lee el cliente.
 */
const REDACCION: Record<
  ComponentVerdict,
  { singular: [string, string]; plural: [string, string] }
> = {
  // [masculino, femenino]
  operativo: { singular: ['operativo', 'operativa'], plural: ['operativos', 'operativas'] },
  reutilizable: {
    singular: ['reutilizable', 'reutilizable'],
    plural: ['reutilizables', 'reutilizables'],
  },
  reparar: {
    singular: ['en condición de reparación', 'en condición de reparación'],
    plural: ['en condición de reparación', 'en condición de reparación'],
  },
  cambiar: {
    singular: ['fuera de servicio', 'fuera de servicio'],
    plural: ['fuera de servicio', 'fuera de servicio'],
  },
};

/**
 * Redacta la conclusión de un componente.
 *
 * El género y el número se deducen de la terminación, que acierta con los
 * componentes reales —el cigüeñal, la camisa, las culatas, los pistones— sin
 * obligar a guardar el género de cada uno en el maestro. Un fallo aquí produce
 * una frase mal escrita en un documento controlado, no un error de programa.
 */
export function composeConclusion(
  componente: string,
  veredicto: ComponentVerdict,
  accion?: string | null,
): string {
  const nombre = componente.trim();

  const plural = /s$/i.test(nombre);
  // `camisa`, `camisas`, `culatas` son femeninos; `pistones`, `turbos`, no.
  const femenino = /as?$/i.test(nombre);

  const determinante = femenino ? (plural ? 'Las' : 'La') : plural ? 'Los' : 'El';
  const verbo = plural ? 'se encuentran' : 'se encuentra';

  const forma = REDACCION[veredicto][plural ? 'plural' : 'singular'][femenino ? 1 : 0];

  const base = `${determinante} ${nombre.toLowerCase()} ${verbo} ${forma}.`;
  return accion?.trim() ? `${base} (${accion.trim()}).` : base;
}

/**
 * Propuestas de conclusión para todo el informe.
 *
 * Se ordenan por gravedad: lo que está fuera de tolerancia va primero, porque
 * es lo que el supervisor tiene que leer sí o sí.
 */
export function proposeConclusions(
  bloques: readonly {
    readonly id: string;
    readonly titulo?: string | null;
    readonly componente?: string | null;
    readonly veredicto?: string | null;
    readonly accionRecomendada?: string | null;
    readonly mediciones?: readonly ResumenDeGrilla[];
  }[],
  accionPorVeredicto: Readonly<Record<string, string>> = {},
): ConclusionPropuesta[] {
  const propuestas: ConclusionPropuesta[] = [];

  for (const bloque of bloques) {
    const grillas = bloque.mediciones ?? [];

    // El veredicto que el técnico haya escrito a mano manda sobre el propuesto:
    // él ha visto la pieza y la grilla solo mide una cosa de ella.
    const veredicto = (bloque.veredicto as ComponentVerdict | null) ?? verdictOfBlock(grillas);
    if (!veredicto) continue;

    const componente = bloque.componente?.trim() || bloque.titulo?.trim();
    if (!componente) continue;

    const accion = bloque.accionRecomendada?.trim() || accionPorVeredicto[veredicto] || null;

    propuestas.push({
      bloqueId: bloque.id,
      componente,
      veredicto,
      accion,
      texto: composeConclusion(componente, veredicto, accion),
      fueraTolerancia: grillas.reduce((n, g) => n + (g.resumen?.fueraTolerancia ?? 0), 0),
    });
  }

  return propuestas.sort(
    (a, b) =>
      GRAVEDAD[b.veredicto] - GRAVEDAD[a.veredicto] || b.fueraTolerancia - a.fueraTolerancia,
  );
}

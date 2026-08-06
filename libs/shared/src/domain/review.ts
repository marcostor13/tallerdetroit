/**
 * Reglas de la revisión colaborativa (E3.2, §14.2).
 *
 * Viven aquí y no en el backend porque las dos partes las necesitan idénticas:
 * el frontend para no ofrecer «Aprobar» cuando quedan observaciones abiertas, y
 * el backend para rechazarlo si alguien lo intenta igual. Con dos
 * implementaciones, la pantalla y el servidor acabarían discrepando sobre
 * cuándo se puede aprobar un informe, que es de las peores cosas que le pueden
 * pasar a un flujo de aprobación.
 */

export interface ComentarioDeRevision {
  readonly id: string;
  /** Bloque al que apunta. Nulo solo si es un comentario general del informe. */
  readonly bloqueId: string | null;
  readonly texto: string;
  readonly autorNombre: string;
  readonly fecha: string | Date;
  readonly resuelto: boolean;
}

export interface ResumenDeRevision {
  readonly total: number;
  readonly abiertos: number;
  readonly resueltos: number;
  /** Abiertos que señalan un bloque concreto. */
  readonly anclados: number;
}

export function comentariosAbiertos<T extends { readonly resuelto: boolean }>(
  comentarios: readonly T[],
): readonly T[] {
  return comentarios.filter((c) => !c.resuelto);
}

export function comentariosDeBloque<T extends { readonly bloqueId: string | null }>(
  comentarios: readonly T[],
  bloqueId: string,
): readonly T[] {
  return comentarios.filter((c) => c.bloqueId === bloqueId);
}

export function resumirRevision(comentarios: readonly ComentarioDeRevision[]): ResumenDeRevision {
  const abiertos = comentariosAbiertos(comentarios);
  return {
    total: comentarios.length,
    abiertos: abiertos.length,
    resueltos: comentarios.length - abiertos.length,
    anclados: abiertos.filter((c) => c.bloqueId !== null).length,
  };
}

/**
 * ¿Se puede observar el informe?
 *
 * §14.2 lo dice: «requiere al menos un comentario anclado a un bloque».
 * Devolver el informe con un «revísalo» genérico deja al técnico repasando
 * catorce trabajos para adivinar a qué se refería el supervisor, que es
 * exactamente lo que pasa hoy con los correos.
 */
export function puedeObservar(comentarios: readonly ComentarioDeRevision[]): boolean {
  return comentariosAbiertos(comentarios).some((c) => c.bloqueId !== null);
}

/**
 * ¿Se puede aprobar?
 *
 * No, mientras quede una observación abierta. Aprobar con observaciones
 * pendientes vacía de sentido la revisión: el informe saldría señalado y
 * aprobado a la vez, y quien lo lea después no sabrá cuál de las dos cosas
 * vale.
 */
export function puedeAprobar(comentarios: readonly ComentarioDeRevision[]): boolean {
  return comentariosAbiertos(comentarios).length === 0;
}

/** Texto de un comentario, validado. Devuelve `null` si no vale. */
export function normalizarComentario(texto: unknown): string | null {
  if (typeof texto !== 'string') return null;
  const limpio = texto.trim();
  return limpio.length ? limpio : null;
}

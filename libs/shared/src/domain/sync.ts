/**
 * Cola de operaciones offline (E4.4, §16.4 `syncQueue`).
 *
 * El técnico trabaja en mina y en taller con conectividad intermitente, y la
 * PWA que ya usa hoy le deja capturar sin red. La plataforma nueva no puede ser
 * peor que eso, así que **todo lo que se captura se guarda primero en local** y
 * se envía cuando hay conexión.
 *
 * Tres decisiones gobiernan este módulo:
 *
 * · **Una operación por cambio, no un guardado del informe entero.** Si dos
 *   técnicos editan bloques distintos del mismo informe sin red, al sincronizar
 *   se conservan los dos. Enviando el informe completo, el segundo en llegar
 *   pisaría el trabajo del primero sin que nadie se enterara.
 *
 * · **`clientOpId` lo genera el cliente y el servidor lo recuerda.** Un doble
 *   toque, un reintento tras un timeout o una pestaña duplicada mandan la misma
 *   operación dos veces; con el identificador, la segunda no crea nada.
 *
 * · **Nada se borra en local hasta que el servidor confirma.** Perder lo
 *   capturado por un error de red es exactamente lo que esta plataforma viene a
 *   evitar.
 */

/** Qué hace la operación. El orden de envío depende del tipo. */
export const TIPOS_DE_OPERACION = [
  'crear-informe',
  'editar-informe',
  'agregar-bloque',
  'editar-bloque',
  'quitar-bloque',
  'guardar-medicion',
  'guardar-checklist',
  'agregar-foto',
  'comentar',
] as const;

export type TipoDeOperacion = (typeof TIPOS_DE_OPERACION)[number];

export type EstadoDeOperacion = 'pendiente' | 'enviando' | 'confirmada' | 'fallida' | 'conflicto';

export interface OperacionOffline {
  /** UUID del cliente. Es lo que hace idempotente el reenvío. */
  readonly clientOpId: string;
  readonly tipo: TipoDeOperacion;
  /**
   * Informe al que afecta.
   *
   * Para uno creado sin red es un **id local** (`local:<uuid>`): el definitivo
   * lo asigna el servidor y se sustituye al confirmar la creación.
   */
  readonly informeId: string;
  /** Bloque concreto, cuando la operación es de bloque. */
  readonly bloqueId?: string | null;
  readonly datos: Readonly<Record<string, unknown>>;
  /** Cuándo lo capturó el técnico, no cuándo se envió. */
  readonly capturadaEn: string;
  readonly estado: EstadoDeOperacion;
  readonly intentos: number;
  readonly error?: string | null;
}

/** Prefijo de los identificadores que todavía no existen en el servidor. */
export const PREFIJO_LOCAL = 'local:';

export function esIdLocal(id: string | null | undefined): boolean {
  return typeof id === 'string' && id.startsWith(PREFIJO_LOCAL);
}

export function idLocal(uuid: string): string {
  return `${PREFIJO_LOCAL}${uuid}`;
}

/**
 * Cuánto se espera antes de reintentar, en milisegundos.
 *
 * Crece exponencialmente y se corta a cinco minutos. Sin tope, un informe que
 * lleva un día sin poder subirse esperaría horas entre intentos y no subiría
 * nunca aunque la red volviera; con un tope bajo, cien operaciones fallando
 * martillearían un servidor que ya está en problemas.
 */
export function esperaDeReintento(intentos: number): number {
  const base = 2_000 * Math.pow(2, Math.max(0, intentos - 1));
  return Math.min(base, 5 * 60_000);
}

/**
 * Cuántas veces se reintenta antes de pedir ayuda.
 *
 * Pasado esto la operación queda `fallida` y visible: lo que no puede pasar es
 * que se reintente en silencio para siempre y el técnico crea que su trabajo
 * está guardado.
 */
export const MAXIMO_DE_INTENTOS = 8;

export function agotoLosIntentos(operacion: Pick<OperacionOffline, 'intentos'>): boolean {
  return operacion.intentos >= MAXIMO_DE_INTENTOS;
}

/**
 * Ordena la cola para enviarla.
 *
 * Dos reglas, y las dos importan:
 *
 * · **Crear el informe va antes que cualquier cosa suya.** Mandar «editar el
 *   bloque 3» de un informe que el servidor no conoce es un 404 garantizado.
 *
 * · **Dentro del mismo informe, orden de captura.** Es el orden en que el
 *   técnico hizo las cosas, y aplicarlo al revés dejaría el informe distinto de
 *   como lo dejó él.
 */
export function ordenarParaEnvio(
  operaciones: readonly OperacionOffline[],
): readonly OperacionOffline[] {
  return [...operaciones].sort((a, b) => {
    if (a.informeId === b.informeId) {
      if (a.tipo === 'crear-informe' && b.tipo !== 'crear-informe') return -1;
      if (b.tipo === 'crear-informe' && a.tipo !== 'crear-informe') return 1;
      return a.capturadaEn.localeCompare(b.capturadaEn);
    }
    return a.capturadaEn.localeCompare(b.capturadaEn);
  });
}

/** Lo que está esperando a salir. Es lo que cuenta el chip de conexión. */
export function operacionesPendientes(
  operaciones: readonly OperacionOffline[],
): readonly OperacionOffline[] {
  return operaciones.filter((o) => o.estado === 'pendiente' || o.estado === 'fallida');
}

export interface ResumenDeCola {
  readonly pendientes: number;
  readonly enviando: number;
  readonly fallidas: number;
  readonly conflictos: number;
  /** Informes distintos con algo sin sincronizar. */
  readonly informes: number;
}

export function resumirCola(operaciones: readonly OperacionOffline[]): ResumenDeCola {
  const cuenta = (estado: EstadoDeOperacion) =>
    operaciones.filter((o) => o.estado === estado).length;

  const sinSincronizar = operaciones.filter((o) => o.estado !== 'confirmada');

  return {
    pendientes: cuenta('pendiente'),
    enviando: cuenta('enviando'),
    fallidas: cuenta('fallida'),
    conflictos: cuenta('conflicto'),
    informes: new Set(sinSincronizar.map((o) => o.informeId)).size,
  };
}

/**
 * Sustituye el id local por el que asignó el servidor.
 *
 * Se aplica en cuanto se confirma la creación: las operaciones que ya estaban
 * en la cola apuntando al informe local pasan a apuntar al de verdad. Sin esto,
 * las veinte fotos que el técnico sacó antes de recuperar la señal se quedarían
 * huérfanas.
 */
export function reemplazarIdLocal(
  operaciones: readonly OperacionOffline[],
  local: string,
  definitivo: string,
): readonly OperacionOffline[] {
  return operaciones.map((o) => (o.informeId === local ? { ...o, informeId: definitivo } : o));
}

/** Lo que el servidor contesta de cada operación. */
export interface ResultadoDeOperacion {
  readonly clientOpId: string;
  readonly estado: 'aplicada' | 'repetida' | 'conflicto' | 'error';
  /** Id definitivo, cuando la operación creaba algo. */
  readonly informeId?: string | null;
  readonly detalle?: string | null;
}

/**
 * Aplica al estado local lo que contestó el servidor.
 *
 * `repetida` cuenta como confirmada: significa que el servidor ya la tenía, que
 * es exactamente lo que se buscaba al mandarla dos veces. Tratarla como error
 * dejaría al técnico viendo pendientes cosas que sí están guardadas.
 */
export function aplicarRespuesta(
  operaciones: readonly OperacionOffline[],
  resultados: readonly ResultadoDeOperacion[],
): readonly OperacionOffline[] {
  const porId = new Map(resultados.map((r) => [r.clientOpId, r]));

  let salida = operaciones.map((operacion) => {
    const resultado = porId.get(operacion.clientOpId);
    if (!resultado) return operacion;

    if (resultado.estado === 'aplicada' || resultado.estado === 'repetida') {
      return { ...operacion, estado: 'confirmada' as const, error: null };
    }
    if (resultado.estado === 'conflicto') {
      return {
        ...operacion,
        estado: 'conflicto' as const,
        error: resultado.detalle ?? 'El servidor tiene una versión distinta de este bloque.',
      };
    }
    return {
      ...operacion,
      estado: 'fallida' as const,
      intentos: operacion.intentos + 1,
      error: resultado.detalle ?? 'No se pudo aplicar.',
    };
  });

  // Los ids definitivos se propagan después de marcar los estados: una creación
  // confirmada arrastra consigo todo lo que colgaba del id local.
  for (const resultado of resultados) {
    const original = operaciones.find((o) => o.clientOpId === resultado.clientOpId);
    if (!original || !resultado.informeId || !esIdLocal(original.informeId)) continue;
    salida = [...reemplazarIdLocal(salida, original.informeId, resultado.informeId)];
  }

  return salida;
}

/** Se quitan de la cola las confirmadas; el resto se conserva. */
export function purgarConfirmadas(
  operaciones: readonly OperacionOffline[],
): readonly OperacionOffline[] {
  return operaciones.filter((o) => o.estado !== 'confirmada');
}

/**
 * ¿Chocan estas dos operaciones?
 *
 * Solo si tocan **el mismo bloque del mismo informe**. Dos técnicos que editan
 * bloques distintos no se estorban, y tratar eso como conflicto obligaría a
 * resolver a mano algo que no tiene nada que resolver (E4.5).
 */
export function chocan(a: OperacionOffline, b: OperacionOffline): boolean {
  if (a.informeId !== b.informeId) return false;
  if (a.clientOpId === b.clientOpId) return false;

  // Sin bloque, la operación afecta al informe entero: choca con otra igual.
  if (!a.bloqueId && !b.bloqueId) return a.tipo === b.tipo;
  return !!a.bloqueId && a.bloqueId === b.bloqueId;
}

export interface LimitesDeAlmacenamiento {
  /** Bytes ocupados en IndexedDB. */
  readonly bytes: number;
  readonly informesSinSincronizar: number;
}

/** Umbrales de E4.8. Pasados, la app avisa antes de que sea un problema. */
export const TOPE_DE_BYTES = 500 * 1024 * 1024;
export const TOPE_DE_INFORMES_SIN_SINCRONIZAR = 5;

/**
 * Aviso de almacenamiento, o `null` si no hay nada que decir.
 *
 * Avisar antes del límite y no al chocar con él: cuando el navegador se queda
 * sin cuota, lo que falla es el guardado que el técnico acaba de hacer, y para
 * entonces ya es tarde.
 */
export function avisoDeAlmacenamiento(limites: LimitesDeAlmacenamiento): string | null {
  if (limites.informesSinSincronizar > TOPE_DE_INFORMES_SIN_SINCRONIZAR) {
    return (
      `Tienes ${limites.informesSinSincronizar} informes sin sincronizar. ` +
      'Conéctate en cuanto puedas: hasta entonces solo existen en este dispositivo.'
    );
  }

  if (limites.bytes > TOPE_DE_BYTES) {
    const mb = Math.round(limites.bytes / 1024 / 1024);
    return (
      `La app ocupa ${mb} MB en este dispositivo. ` +
      'Sincroniza para liberar espacio antes de seguir capturando fotos.'
    );
  }

  return null;
}

/**
 * Caché de maestros en el dispositivo (E4.2, §13).
 *
 * Sin esto, un informe creado sin red se queda a medias: el técnico puede
 * escribir el texto, pero los desplegables de cliente, sede, equipo y motor no
 * tienen nada que ofrecer, y esos campos son precisamente los que enlazan el
 * informe con el resto del sistema. Escribirlos a mano en texto libre es lo que
 * la plataforma viene a eliminar.
 *
 * Tres decisiones gobiernan este módulo:
 *
 * · **No se cachean los 35 catálogos, solo los que se usan capturando.** Bajar
 *   los 35 al iniciar sesión costaría megabytes y minutos por catálogos que
 *   solo mira Calidad desde su escritorio, con red.
 *
 * · **La sincronización es delta, no un volcado.** Se pide «lo que cambió desde
 *   la última vez» y no la lista entera: en un teléfono con datos móviles, la
 *   diferencia entre bajar 40 registros nuevos y bajar 8.000 cada cuatro horas
 *   es la diferencia entre que la caché sirva y que se desactive.
 *
 * · **Las bajas viajan igual que las altas.** Un cliente que solo recibiera
 *   registros activos nunca se enteraría de que una sede se desactivó, y
 *   seguiría ofreciéndola para siempre.
 */

/** Cada cuánto se refresca la caché. §18 pide cada 4 horas. */
export const INTERVALO_DE_SINCRONIZACION = 4 * 60 * 60 * 1000;

/**
 * Maestros que se guardan en el dispositivo.
 *
 * Son los que aparecen en el wizard de captura. El resto —organizaciones,
 * unidades de negocio, catálogos de administración— se consultan con red desde
 * las pantallas de mantenimiento, que no se usan en campo.
 */
export const MAESTROS_EN_CACHE = [
  'clients',
  'sites',
  'equipments',
  'engines',
  'engineModels',
  'engineSpecs',
  'technicians',
  'engineComponents',
  'units',
  'instruments',
  'interventionTypes',
  'componentVerdicts',
] as const;

export type MaestroEnCache = (typeof MAESTROS_EN_CACHE)[number];

export function seCachea(coleccion: string): boolean {
  return (MAESTROS_EN_CACHE as readonly string[]).includes(coleccion);
}

/** Un registro tal como llega en el delta. */
export interface RegistroDeMaestro {
  readonly _id: string;
  readonly updatedAt?: string | null;
  /** Baja lógica. Si viene, el registro sale de la caché. */
  readonly deletedAt?: string | null;
  readonly activo?: boolean;
  readonly [campo: string]: unknown;
}

export interface DeltaDeMaestro {
  readonly coleccion: string;
  readonly items: readonly RegistroDeMaestro[];
  /**
   * Marca de tiempo del servidor al atender la petición.
   *
   * Es la que se guarda para la siguiente llamada, y viene del servidor y no
   * del dispositivo a propósito: el reloj de un teléfono se desvía, y con un
   * `desde` adelantado unos minutos se perderían para siempre los cambios de
   * esa ventana.
   */
  readonly hasta: string;
}

/**
 * ¿Sigue vigente este registro?
 *
 * Un registro dado de baja o desactivado se borra de la caché en lugar de
 * guardarse marcado: lo único que se hace con la caché es ofrecer opciones, y
 * una opción que no se puede elegir no tiene por qué ocupar sitio.
 */
export function estaVigente(registro: RegistroDeMaestro): boolean {
  if (registro.deletedAt) return false;
  return registro.activo !== false;
}

export interface EstadoDeMaestro {
  readonly coleccion: string;
  /** `hasta` de la última sincronización correcta, o `null` si nunca hubo. */
  readonly sincronizadoHasta: string | null;
}

/**
 * ¿Toca sincronizar?
 *
 * Nunca sincronizado siempre toca. Después, cada cuatro horas — y contadas
 * desde el momento de la última respuesta del servidor, no desde el arranque de
 * la app: abrirla seis veces en una mañana no puede significar seis descargas.
 */
export function tocaSincronizar(
  ultimaSincronizacion: string | null,
  ahora: Date,
  intervalo: number = INTERVALO_DE_SINCRONIZACION,
): boolean {
  if (!ultimaSincronizacion) return true;

  const desde = new Date(ultimaSincronizacion).getTime();
  if (Number.isNaN(desde)) return true;

  return ahora.getTime() - desde >= intervalo;
}

export interface ResultadoDeMezcla<T extends RegistroDeMaestro> {
  /** Registros que hay que guardar o reemplazar. */
  readonly guardar: readonly T[];
  /** Identificadores que hay que borrar de la caché. */
  readonly borrar: readonly string[];
}

/**
 * Separa un delta en lo que se guarda y lo que se borra.
 *
 * Va aquí y no en el servicio del navegador porque es la regla que decide qué
 * ve el técnico en el desplegable, y una regla así no puede vivir escondida
 * entre llamadas a IndexedDB donde nadie la puede probar.
 */
export function mezclarDelta<T extends RegistroDeMaestro>(
  items: readonly T[],
): ResultadoDeMezcla<T> {
  const guardar: T[] = [];
  const borrar: string[] = [];

  for (const registro of items) {
    if (estaVigente(registro)) guardar.push(registro);
    else borrar.push(registro._id);
  }

  return { guardar, borrar };
}

/**
 * Resumen de la caché para la pantalla de perfil.
 *
 * El técnico tiene que poder mirar antes de bajar a la mina si lo que lleva
 * está al día. «Sincronizado hace 3 horas» es accionable; «sincronizado» no.
 */
export function describirCache(
  estados: readonly EstadoDeMaestro[],
  ahora: Date,
): { readonly maestros: number; readonly alDia: boolean; readonly texto: string } {
  const sincronizados = estados.filter((e) => e.sincronizadoHasta);

  if (!sincronizados.length) {
    return {
      maestros: 0,
      alDia: false,
      texto: 'Todavía no hay maestros guardados en este dispositivo.',
    };
  }

  const masVieja = sincronizados
    .map((e) => new Date(e.sincronizadoHasta as string).getTime())
    .reduce((a, b) => Math.min(a, b));

  const horas = Math.floor((ahora.getTime() - masVieja) / (60 * 60 * 1000));
  const alDia = !tocaSincronizar(new Date(masVieja).toISOString(), ahora);

  const cuando =
    horas < 1 ? 'hace menos de una hora' : horas === 1 ? 'hace 1 hora' : `hace ${horas} horas`;

  return {
    maestros: sincronizados.length,
    alDia,
    texto: `${sincronizados.length} catálogos guardados, actualizados ${cuando}.`,
  };
}

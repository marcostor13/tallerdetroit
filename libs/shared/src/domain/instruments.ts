/**
 * Control de calibración de los instrumentos (RN-04, maestro 17).
 *
 * Una medición vale lo que vale el instrumento con el que se tomó. Un
 * micrómetro descalibrado no da un error visible: da números creíbles y
 * equivocados, y el informe los presenta con tres decimales como si fueran
 * ciertos. Por eso la regla no es una recomendación sino una **advertencia
 * bloqueante**: no se emite un informe medido con un instrumento vencido salvo
 * que el Administrador lo salve por escrito.
 *
 * La comparación es contra la **fecha del servicio**, no contra hoy. Un informe
 * que se redacta en agosto sobre un trabajo de junio se juzga por si el
 * instrumento estaba calibrado en junio: lo contrario invalidaría trabajos
 * correctos solo por tardar en escribirlos.
 */

export interface InstrumentoUsado {
  readonly id?: string | null;
  readonly codigo: string;
  readonly denominacion?: string | null;
  readonly serie?: string | null;
  /** Hasta cuándo vale su calibración. */
  readonly calibracionVence?: string | Date | null;
  /** Certificado o patrón con el que se calibró. */
  readonly certificado?: string | null;
}

export type EstadoDeCalibracion = 'vigente' | 'por_vencer' | 'vencida' | 'sin_datos';

export interface CalibracionEvaluada {
  readonly instrumento: InstrumentoUsado;
  readonly estado: EstadoDeCalibracion;
  /** Días que faltan; negativo si ya venció. `null` si no hay fecha. */
  readonly dias: number | null;
}

/**
 * Con cuánta antelación se avisa de que una calibración va a vencer.
 *
 * Treinta días es lo que tarda en la práctica un envío a laboratorio y su
 * vuelta. Avisar el mismo día del vencimiento no sirve de nada: el instrumento
 * ya está fuera y el taller se queda sin él.
 */
export const DIAS_DE_AVISO_DE_CALIBRACION = 30;

const MS_POR_DIA = 24 * 60 * 60 * 1000;

function aFecha(valor: string | Date | null | undefined): Date | null {
  if (!valor) return null;
  const fecha = valor instanceof Date ? valor : new Date(valor);
  return isNaN(fecha.getTime()) ? null : fecha;
}

/**
 * Días entre dos fechas, contando solo el día del calendario.
 *
 * Sin normalizar la hora, un instrumento que vence hoy a las 00:00 sale como
 * vencido a las 09:00 de la mañana del mismo día, cuando en realidad ese día
 * todavía es válido: los certificados se emiten por día, no por hora.
 */
function diasEntre(desde: Date, hasta: Date): number {
  const a = Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), desde.getUTCDate());
  const b = Date.UTC(hasta.getUTCFullYear(), hasta.getUTCMonth(), hasta.getUTCDate());
  return Math.round((b - a) / MS_POR_DIA);
}

/**
 * En qué estado está la calibración de un instrumento a una fecha dada.
 *
 * Sin fecha de vencimiento el estado es `sin_datos` y **no bloquea**: la
 * mayoría de los instrumentos del taller entran al maestro sin su certificado
 * cargado, y bloquear por eso pararía la operación el primer día. Lo que hace
 * es quedar señalado para que alguien lo complete.
 */
export function evaluarCalibracion(
  instrumento: InstrumentoUsado,
  fechaDelServicio: string | Date = new Date(),
): CalibracionEvaluada {
  const vence = aFecha(instrumento.calibracionVence);
  const referencia = aFecha(fechaDelServicio) ?? new Date();

  if (!vence) return { instrumento, estado: 'sin_datos', dias: null };

  const dias = diasEntre(referencia, vence);

  if (dias < 0) return { instrumento, estado: 'vencida', dias };
  if (dias <= DIAS_DE_AVISO_DE_CALIBRACION) return { instrumento, estado: 'por_vencer', dias };
  return { instrumento, estado: 'vigente', dias };
}

/** Los que impiden emitir: vencidos a la fecha del servicio (RN-04). */
export function instrumentosVencidos(
  instrumentos: readonly InstrumentoUsado[],
  fechaDelServicio: string | Date = new Date(),
): readonly CalibracionEvaluada[] {
  return instrumentos
    .map((i) => evaluarCalibracion(i, fechaDelServicio))
    .filter((e) => e.estado === 'vencida');
}

/** Los que hay que mandar a calibrar pronto. No bloquean nada. */
export function instrumentosPorVencer(
  instrumentos: readonly InstrumentoUsado[],
  fechaDelServicio: string | Date = new Date(),
): readonly CalibracionEvaluada[] {
  return instrumentos
    .map((i) => evaluarCalibracion(i, fechaDelServicio))
    .filter((e) => e.estado === 'por_vencer');
}

/**
 * Cómo se explica el problema en pantalla y en el aviso de emisión.
 *
 * Dice el instrumento, cuánto hace que venció y qué hacer. Un «calibración
 * vencida» a secas obliga al técnico a ir al maestro a averiguar cuál de los
 * seis instrumentos es.
 */
export function explicarCalibracion(evaluada: CalibracionEvaluada): string {
  const { instrumento, estado, dias } = evaluada;
  const nombre = instrumento.denominacion
    ? `${instrumento.codigo} (${instrumento.denominacion})`
    : instrumento.codigo;

  switch (estado) {
    case 'vencida':
      return (
        `La calibración de ${nombre} venció hace ${Math.abs(dias ?? 0)} día(s) ` +
        'a la fecha del servicio. Cámbialo por uno calibrado o pide al ' +
        'Administrador que autorice la emisión dejando el motivo por escrito.'
      );
    case 'por_vencer':
      return `La calibración de ${nombre} vence en ${dias} día(s): mándalo a calibrar.`;
    case 'sin_datos':
      return `${nombre} no tiene fecha de calibración cargada en el maestro.`;
    default:
      return `${nombre} está calibrado.`;
  }
}

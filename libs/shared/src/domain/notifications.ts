/**
 * Avisos por correo del flujo de aprobación (E3.9, UX-08).
 *
 * La composición vive aquí y no en el backend porque es la parte que hay que
 * poder probar y revisar sin levantar un servidor de correo: qué se dice, a
 * quién y con qué asunto. El envío —el transporte SMTP— sí es del backend.
 *
 * Cuatro transiciones avisan: **enviado a revisión, observado, aprobado y
 * emitido**. Las demás no. Un correo por cada guardado convertiría la bandeja
 * del supervisor en ruido, y el primer efecto de eso es que deje de mirarla.
 */

import type { ReportStatus } from './report-status';

export interface DestinatarioDeAviso {
  readonly email: string;
  readonly nombre?: string | null;
}

/** Lo que hace falta saber del informe para redactar el aviso. */
export interface InformeParaAviso {
  readonly id: string;
  readonly numeroInforme: string;
  readonly numeroOt?: string | null;
  readonly cliente?: string | null;
  readonly equipo?: string | null;
  /** Quién ejecutó la transición. */
  readonly actorNombre: string;
  /** El comentario de la transición: en «observado» es lo que hay que corregir. */
  readonly comentario?: string | null;
  /** Observaciones abiertas al momento del aviso. */
  readonly observacionesAbiertas?: number;
}

export interface AvisoDeInforme {
  readonly asunto: string;
  readonly cuerpo: string;
  /** A dónde lleva el enlace del correo, relativo a la app. */
  readonly ruta: string;
}

/** Estados que generan aviso. El resto son ruido para quien lo recibe. */
export const ESTADOS_QUE_AVISAN: readonly ReportStatus[] = [
  'en_revision',
  'observado',
  'aprobado',
  'emitido',
];

export function avisaAlCambiarA(estado: ReportStatus): boolean {
  return ESTADOS_QUE_AVISAN.includes(estado);
}

/** Una línea con lo que identifica el informe, para la cabecera del correo. */
function encabezado(informe: InformeParaAviso): string {
  const partes = [informe.numeroInforme];
  if (informe.numeroOt) partes.push(`O/T ${informe.numeroOt}`);
  if (informe.cliente) partes.push(informe.cliente);
  if (informe.equipo) partes.push(informe.equipo);
  return partes.join(' · ');
}

/**
 * Redacta el aviso de una transición.
 *
 * El asunto lleva **el número de informe delante**: quien lo recibe tiene
 * treinta correos parecidos y lo que busca es ese número, no el verbo.
 *
 * Y el cuerpo dice **qué se espera de quien lo lee**. Un «el informe cambió de
 * estado» obliga al destinatario a entrar a averiguar si le toca hacer algo,
 * que es justo el trabajo que el aviso tendría que ahorrarle.
 */
export function componerAviso(
  estado: ReportStatus,
  informe: InformeParaAviso,
): AvisoDeInforme | null {
  if (!avisaAlCambiarA(estado)) return null;

  const ruta = `/informes/${informe.id}`;
  const cabecera = encabezado(informe);

  switch (estado) {
    case 'en_revision':
      return {
        asunto: `${informe.numeroInforme} · pendiente de tu revisión`,
        cuerpo:
          `${cabecera}\n\n` +
          `${informe.actorNombre} ha enviado este informe a revisión.\n\n` +
          'Revísalo y devuélvelo con observaciones o apruébalo. ' +
          'Los comentarios van anclados al bloque que haya que corregir.',
        ruta,
      };

    case 'observado':
      return {
        asunto: `${informe.numeroInforme} · devuelto con observaciones`,
        cuerpo:
          `${cabecera}\n\n` +
          `${informe.actorNombre} ha devuelto el informe con ` +
          `${informe.observacionesAbiertas ?? 0} observación(es) por atender.\n\n` +
          // El motivo va en el correo y no solo en la plataforma: el técnico
          // decide desde el móvil si tiene que dejar lo que está haciendo.
          (informe.comentario ? `Motivo: ${informe.comentario}\n\n` : '') +
          'Corrige lo señalado y vuelve a enviarlo a revisión.',
        ruta,
      };

    case 'aprobado':
      return {
        asunto: `${informe.numeroInforme} · aprobado`,
        cuerpo:
          `${cabecera}\n\n` + `${informe.actorNombre} ha aprobado el informe. Ya se puede emitir.`,
        ruta,
      };

    case 'emitido':
      return {
        asunto: `${informe.numeroInforme} · emitido`,
        cuerpo:
          `${cabecera}\n\n` +
          `${informe.actorNombre} ha emitido el informe. ` +
          'A partir de ahora es inmutable: para corregirlo hay que emitir una versión nueva.\n\n' +
          'El documento queda disponible en la plataforma con su hash de verificación.',
        ruta,
      };

    default:
      return null;
  }
}

/**
 * A quién se le avisa de cada transición.
 *
 * No es «a todos los que participan»: al que ejecutó la acción no se le avisa
 * de su propia acción —ya lo sabe, y recibir un correo de lo que acabas de
 * hacer enseña a ignorar los correos—, y al revisor solo cuando le toca actuar.
 */
export function destinatariosDe(
  estado: ReportStatus,
  participantes: {
    readonly autor?: DestinatarioDeAviso | null;
    readonly revisores?: readonly DestinatarioDeAviso[];
  },
  actorEmail?: string | null,
): readonly DestinatarioDeAviso[] {
  const autor = participantes.autor ? [participantes.autor] : [];
  const revisores = participantes.revisores ?? [];

  const destinos =
    estado === 'en_revision'
      ? // Le toca al revisor: es quien tiene que hacer algo.
        revisores
      : estado === 'observado'
        ? // Y aquí al autor, que es quien corrige.
          autor
        : // Aprobado y emitido: se entera todo el que participa.
          [...autor, ...revisores];

  const vistos = new Set<string>();
  return destinos.filter((d) => {
    const email = d.email?.trim().toLowerCase();
    if (!email || email === actorEmail?.trim().toLowerCase()) return false;
    if (vistos.has(email)) return false;
    vistos.add(email);
    return true;
  });
}

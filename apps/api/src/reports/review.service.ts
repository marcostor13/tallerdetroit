import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import {
  comentariosAbiertos,
  normalizarComentario,
  puedeAprobar,
  puedeObservar,
} from '@dps/shared';
import type { ReportDocument } from './schemas/report.schema';
import type { AuthUser } from '../common/decorators/current-user.decorator';

/** Lo que llega al comentar. */
export interface NuevoComentario {
  readonly bloqueId?: string | null;
  readonly texto?: string;
}

/**
 * Revisión colaborativa (E3.2, UX-08).
 *
 * Un comentario va **anclado a un bloque**: «corregir la medición» sin decir
 * cuál obliga al técnico a repasar catorce trabajos para adivinar a qué se
 * refería el supervisor, que es lo que pasa hoy con los correos.
 *
 * Y un comentario **no se borra**: se marca resuelto, con quién y cuándo. Si se
 * pudiera borrar, la observación incómoda desaparecería justo antes de aprobar
 * y el informe diría que nunca hubo nada que corregir.
 */
@Injectable()
export class ReviewService {
  /** Añade un comentario al informe. Devuelve el creado. */
  comentar(doc: ReportDocument, entrada: NuevoComentario, actor: AuthUser) {
    const texto = normalizarComentario(entrada.texto);
    if (!texto) {
      throw new BadRequestException('El comentario no puede estar vacío: di qué hay que corregir.');
    }

    // Un comentario anclado a un bloque que no existe es un comentario perdido:
    // el técnico nunca lo vería, porque la pantalla lo pinta junto a su bloque.
    if (entrada.bloqueId && !doc.bloques.some((b) => b.id === entrada.bloqueId)) {
      throw new NotFoundException('Ese bloque no existe en el informe.');
    }

    const comentario = {
      id: randomUUID(),
      bloqueId: entrada.bloqueId ?? null,
      texto,
      autorId: new Types.ObjectId(actor.id),
      autorNombre: actor.nombre,
      fecha: new Date(),
      resuelto: false,
      resueltoPor: null,
      resueltoEn: null,
    };

    doc.comentarios.push(comentario as never);
    doc.markModified('comentarios');

    return comentario;
  }

  /**
   * Marca un comentario como resuelto, o lo devuelve a abierto.
   *
   * Reabrir hace falta: el técnico da por resuelto lo que cree haber corregido
   * y el supervisor comprueba que no. Sin reabrir, la única salida sería un
   * comentario nuevo y el hilo de la observación se perdería.
   */
  resolver(doc: ReportDocument, comentarioId: string, resuelto: boolean, actor: AuthUser) {
    const comentario = doc.comentarios.find((c) => c.id === comentarioId);
    if (!comentario) throw new NotFoundException('No existe ese comentario.');

    comentario.resuelto = resuelto;
    comentario.resueltoPor = resuelto ? new Types.ObjectId(actor.id) : null;
    comentario.resueltoEn = resuelto ? new Date() : null;
    doc.markModified('comentarios');

    return comentario;
  }

  /** Comentarios sin resolver. Son los que impiden aprobar. */
  abiertos(doc: Pick<ReportDocument, 'comentarios'>) {
    return comentariosAbiertos(doc.comentarios ?? []);
  }

  /**
   * ¿Se puede devolver el informe al técnico?
   *
   * §14.2: hace falta al menos un comentario anclado a un bloque. La regla vive
   * en `libs/shared` para que la pantalla no ofrezca «Observar» cuando el
   * servidor lo va a rechazar.
   */
  sePuedeObservar(doc: Pick<ReportDocument, 'comentarios'>): boolean {
    return puedeObservar(doc.comentarios ?? []);
  }

  /**
   * Qué impide aprobar (criterio de F3).
   *
   * Aprobar con observaciones abiertas vacía de sentido la revisión: el informe
   * saldría con el defecto señalado y aprobado a la vez.
   */
  exigirSinComentariosAbiertos(doc: ReportDocument): void {
    if (puedeAprobar(doc.comentarios ?? [])) return;
    const abiertos = this.abiertos(doc);

    throw new BadRequestException({
      message:
        `Quedan ${abiertos.length} comentario(s) sin resolver. ` +
        'Resuélvelos antes de aprobar: aprobar con observaciones abiertas dejaría ' +
        'el informe señalado y aprobado a la vez.',
      comentarios: abiertos.map((c) => ({
        id: c.id,
        bloqueId: c.bloqueId,
        texto: c.texto,
        autorNombre: c.autorNombre,
      })),
    });
  }
}

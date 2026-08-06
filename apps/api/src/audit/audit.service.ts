import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, type FilterQuery } from 'mongoose';
import { AuditLog, type AuditLogDocument } from './schemas/audit-log.schema';
import { contextoActual } from '../common/request-context';
import type { AuthUser } from '../common/decorators/current-user.decorator';

/** Lo que se anota de un cambio. */
export interface EventoAuditable {
  readonly entidad: string;
  readonly entidadId: string;
  readonly accion: string;
  readonly etiqueta?: string | null;
  readonly antes?: unknown;
  readonly despues?: unknown;
}

/** De dónde vino la petición. Lo pone el interceptor. */
export interface OrigenPeticion {
  readonly ip?: string | null;
  readonly userAgent?: string | null;
}

export interface ConsultaDeAuditoria {
  readonly actorId?: string;
  readonly entidad?: string;
  readonly entidadId?: string;
  readonly accion?: string;
  readonly desde?: string;
  readonly hasta?: string;
  readonly limit?: number;
  readonly skip?: number;
}

/** Campos que nunca se copian a un registro de auditoría. */
const NUNCA_SE_REGISTRA = new Set(['password', 'passwordHash', 'refreshTokenHash', 'token']);

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(@InjectModel(AuditLog.name) private readonly logs: Model<AuditLogDocument>) {}

  /**
   * Anota un evento.
   *
   * **No lanza nunca.** Si la escritura del log falla, lo que no puede pasar es
   * que el técnico pierda el trabajo que acababa de guardar: la operación de
   * negocio ya ocurrió y negarla ahora sería peor que quedarse sin el registro.
   * El fallo se deja en el log de la aplicación, que es donde se va a mirar
   * cuando alguien note que faltan entradas.
   */
  async registrar(
    actor: AuthUser | null,
    evento: EventoAuditable,
    origen: OrigenPeticion = contextoActual(),
  ): Promise<void> {
    try {
      await this.logs.create({
        actorId: actor?.id ? new Types.ObjectId(actor.id) : new Types.ObjectId(),
        actorEmail: actor?.email ?? 'sistema',
        actorRol: actor?.rol ?? null,
        entidad: evento.entidad,
        entidadId: evento.entidadId,
        accion: evento.accion,
        etiqueta: evento.etiqueta ?? null,
        antes: this.limpiar(evento.antes),
        despues: this.limpiar(evento.despues),
        ip: origen.ip ?? null,
        userAgent: origen.userAgent ?? null,
      });
    } catch (e: unknown) {
      this.logger.error(
        `No se pudo anotar ${evento.accion} sobre ${evento.entidad}/${evento.entidadId}: ${String(e)}`,
      );
    }
  }

  /**
   * Consulta para el Administrador: actor, entidad, acción y rango de fechas.
   *
   * Devuelve el total además de la página porque la pregunta que se le hace a
   * un log de auditoría casi siempre es «cuántas veces», no «cuáles».
   */
  async consultar(consulta: ConsultaDeAuditoria = {}) {
    const filtro: FilterQuery<AuditLogDocument> = {};

    if (consulta.actorId && Types.ObjectId.isValid(consulta.actorId)) {
      filtro.actorId = new Types.ObjectId(consulta.actorId);
    }
    if (consulta.entidad) filtro.entidad = consulta.entidad;
    if (consulta.entidadId) filtro.entidadId = consulta.entidadId;
    if (consulta.accion) filtro.accion = consulta.accion;

    const desde = consulta.desde ? new Date(consulta.desde) : null;
    const hasta = consulta.hasta ? new Date(consulta.hasta) : null;
    const rango: { $gte?: Date; $lte?: Date } = {};

    if (desde && !isNaN(desde.getTime())) rango.$gte = desde;
    // El «hasta» de un filtro de fechas se entiende inclusive: quien pide
    // «hasta el 6 de agosto» quiere lo del día 6, no lo anterior a su 00:00.
    if (hasta && !isNaN(hasta.getTime())) {
      rango.$lte =
        hasta.getUTCHours() === 0 && hasta.getUTCMinutes() === 0
          ? new Date(hasta.getTime() + 86_399_999)
          : hasta;
    }
    if (rango.$gte || rango.$lte) filtro.fecha = rango;

    const limit = Math.min(Math.max(consulta.limit ?? 50, 1), 200);
    const skip = Math.max(consulta.skip ?? 0, 0);

    const [items, total] = await Promise.all([
      this.logs.find(filtro).sort({ fecha: -1 }).skip(skip).limit(limit).lean().exec(),
      this.logs.countDocuments(filtro).exec(),
    ]);

    return { total, items };
  }

  /** El historial completo de una entidad, de lo más nuevo a lo más viejo. */
  async historialDe(entidad: string, entidadId: string, limit = 100) {
    return this.logs
      .find({ entidad, entidadId })
      .sort({ fecha: -1 })
      .limit(Math.min(limit, 200))
      .lean()
      .exec();
  }

  /**
   * Quita del registro lo que no debe quedar escrito.
   *
   * Un hash de contraseña en un log que vive siete años es una filtración con
   * retraso. Se recorta también lo muy grande: el objetivo es saber qué cambió,
   * no guardar una segunda copia del informe.
   */
  private limpiar(valor: unknown): unknown {
    if (valor === null || valor === undefined) return null;
    if (typeof valor !== 'object') return valor;
    if (Array.isArray(valor)) return valor.length > 50 ? `[${valor.length} elementos]` : valor;

    const salida: Record<string, unknown> = {};
    for (const [clave, dato] of Object.entries(valor as Record<string, unknown>)) {
      if (NUNCA_SE_REGISTRA.has(clave)) continue;
      salida[clave] = this.limpiar(dato);
    }
    return salida;
  }
}

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types, Schema as MongooseSchema } from 'mongoose';

/** Siete años, que es lo que exige la retención documental del cliente (§16.4). */
export const RETENCION_AUDITORIA_SEGUNDOS = 7 * 365 * 24 * 60 * 60;

/**
 * Registro de auditoría (§16.4, §20).
 *
 * **Append-only.** No hay ningún método que actualice ni borre: un registro de
 * auditoría que se puede editar no es auditoría, es una tabla más. Lo único que
 * lo retira es el TTL de siete años, que es la retención documental acordada.
 *
 * Guarda el **antes y el después** de lo que cambió, no el documento entero.
 * Copiar el informe completo en cada guardado multiplicaría por veinte el
 * tamaño de la base sin responder mejor a la pregunta que se le hace a un log
 * de auditoría: quién cambió qué, cuándo, y desde dónde.
 */
@Schema({ collection: 'auditLogs', timestamps: { createdAt: 'fecha', updatedAt: false } })
export class AuditLog {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  actorId!: Types.ObjectId;

  /** Denormalizado: el log tiene que seguir siendo legible si el usuario se da de baja. */
  @Prop({ type: String, required: true })
  actorEmail!: string;

  @Prop({ type: String, default: null })
  actorRol!: string | null;

  /** `reports`, `masters.clients`, `templateVersions`, `users`… */
  @Prop({ type: String, required: true, index: true })
  entidad!: string;

  @Prop({ type: String, required: true, index: true })
  entidadId!: string;

  /** `crear`, `actualizar`, `eliminar`, `transicion`, `emitir`, `login`… */
  @Prop({ type: String, required: true, index: true })
  accion!: string;

  /** Lo que identifica la entidad para un humano: el número del informe. */
  @Prop({ type: String, default: null })
  etiqueta!: string | null;

  @Prop({ type: MongooseSchema.Types.Mixed, default: null })
  antes!: unknown;

  @Prop({ type: MongooseSchema.Types.Mixed, default: null })
  despues!: unknown;

  @Prop({ type: String, default: null })
  ip!: string | null;

  @Prop({ type: String, default: null })
  userAgent!: string | null;

  /** La pone `timestamps` al insertar; nada la reescribe después. */
  fecha!: Date;
}

export type AuditLogDocument = AuditLog & Document;
export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

// La consulta del Administrador filtra por actor, entidad, acción y rango de
// fechas, y siempre ordena por fecha descendente: el índice compuesto la cubre
// sin tener que ordenar en memoria.
AuditLogSchema.index({ fecha: -1 });
AuditLogSchema.index({ actorId: 1, fecha: -1 });
AuditLogSchema.index({ entidad: 1, entidadId: 1, fecha: -1 });

// TTL de siete años. Va en el propio esquema y no en una tarea programada para
// que no dependa de que alguien acuerde ejecutarla.
AuditLogSchema.index({ fecha: 1 }, { expireAfterSeconds: RETENCION_AUDITORIA_SEGUNDOS });

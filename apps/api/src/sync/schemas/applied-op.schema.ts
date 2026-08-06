import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';

/**
 * Treinta días. Es lo que puede tardar un técnico en volver de una mina con el
 * teléfono sin red y sincronizar lo que capturó. Pasado eso, un reenvío de la
 * misma operación ya no se reconoce como repetida —y crearía un duplicado—,
 * pero guardar todos los identificadores para siempre haría crecer la colección
 * sin límite por una ventana que en la práctica es de horas.
 */
export const RETENCION_DE_OPERACIONES_SEGUNDOS = 30 * 24 * 60 * 60;

/**
 * Operaciones offline ya aplicadas (E4.4, §16.4 `syncQueue`).
 *
 * Es lo que hace idempotente el reenvío: un doble toque, un reintento tras un
 * timeout o una pestaña duplicada mandan la misma operación dos veces, y con
 * este registro la segunda **no crea nada** — se contesta con lo que devolvió
 * la primera.
 *
 * Se guarda el resultado y no solo el identificador: el cliente necesita saber
 * qué id le asignó el servidor al informe que creó sin red, y si la respuesta
 * a la repetición fuera un simple «ya estaba», ese id se perdería.
 */
@Schema({ collection: 'syncOps', timestamps: { createdAt: 'fecha', updatedAt: false } })
export class AppliedOp {
  @Prop({ type: String, required: true })
  clientOpId!: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  actorId!: Types.ObjectId;

  @Prop({ type: String, required: true })
  tipo!: string;

  /** Id definitivo del informe afectado. */
  @Prop({ type: String, default: null })
  informeId!: string | null;

  fecha!: Date;
}

export type AppliedOpDocument = AppliedOp & Document;
export const AppliedOpSchema = SchemaFactory.createForClass(AppliedOp);

// Único por operación **y por actor**: dos técnicos podrían generar el mismo
// UUID solo por un fallo de generación, y aun así sus operaciones son distintas.
AppliedOpSchema.index({ clientOpId: 1, actorId: 1 }, { unique: true });
AppliedOpSchema.index({ fecha: 1 }, { expireAfterSeconds: RETENCION_DE_OPERACIONES_SEGUNDOS });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Maestro 1 (`clients`) del §13.1.
 *
 * Existe precisamente por el daño que documentan los informes reales:
 * `TOQUEPALA` y `SPCC. TOQUEPALA` son el mismo cliente escrito de dos formas, y
 * mientras sea texto libre no hay analítica posible.
 */
@Schema({ collection: 'clients', timestamps: true })
export class Client {
  @Prop({ type: String, required: true, trim: true })
  razonSocial!: string;

  /** El que se muestra en la interfaz y en la cabecera del informe. */
  @Prop({ type: String, required: true, trim: true })
  nombreCorto!: string;

  @Prop({ type: String, default: null, trim: true })
  ruc!: string | null;

  @Prop({ type: String, default: null })
  contacto!: string | null;

  @Prop({ type: String, default: null })
  telefono!: string | null;

  @Prop({ type: String, default: null })
  email!: string | null;

  @Prop({ type: String, default: null })
  logoS3Key!: string | null;

  @Prop({ type: Types.ObjectId, ref: 'Organization', default: null })
  organizacionId!: Types.ObjectId | null;

  /**
   * Alta creada al vuelo desde el formulario del informe (§13.3.1). Nace
   * incompleta a propósito: lo importante es no interrumpir al técnico.
   * Administración la completa después.
   */
  @Prop({ type: Boolean, default: false })
  pendienteValidacion!: boolean;

  @Prop({ type: Boolean, default: true })
  activo!: boolean;

  @Prop({ type: Date, default: null })
  deletedAt!: Date | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  createdBy!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  updatedBy!: Types.ObjectId | null;
}

export type ClientDocument = Client & Document;

export const ClientSchema = SchemaFactory.createForClass(Client);

ClientSchema.index({ nombreCorto: 1 });
ClientSchema.index({ ruc: 1 }, { unique: true, sparse: true });
ClientSchema.index({ activo: 1, deletedAt: 1 });
// Búsqueda por texto sobre los campos por los que un técnico buscaría.
ClientSchema.index({ razonSocial: 'text', nombreCorto: 'text' });

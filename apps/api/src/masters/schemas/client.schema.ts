import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';

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

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Organization', default: null })
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

  /**
   * A qué registro se fusionó este (§13.3.5). El duplicado no se borra: los
   * informes emitidos guardan su identificador y tienen que poder resolverlo.
   */
  @Prop({ type: SchemaTypes.ObjectId, default: null })
  fusionadoEn!: Types.ObjectId | null;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', default: null })
  createdBy!: Types.ObjectId | null;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', default: null })
  updatedBy!: Types.ObjectId | null;
}

export type ClientDocument = Client & Document;

export const ClientSchema = SchemaFactory.createForClass(Client);

ClientSchema.index({ nombreCorto: 1 });
// Índice parcial y no `sparse`. Un índice disperso solo ignora el campo
// **ausente**, y aquí `ruc` tiene `default: null`, así que se guarda como null:
// con `sparse` el segundo cliente sin RUC chocaba con el primero. En el alta
// rápida desde el informe (§13.3.1) el RUC no se pide, con lo que el técnico se
// habría encontrado un «ya existe un cliente con ruc null» sin sentido alguno.
ClientSchema.index(
  { ruc: 1 },
  { unique: true, partialFilterExpression: { ruc: { $type: 'string' } } },
);
ClientSchema.index({ activo: 1, deletedAt: 1 });
// Búsqueda por texto sobre los campos por los que un técnico buscaría.
ClientSchema.index({ razonSocial: 'text', nombreCorto: 'text' });

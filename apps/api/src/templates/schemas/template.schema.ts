import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import type { TemplateSectionDefinition, TemplateStatus } from '@dps/shared';

/**
 * Maestro 23 (`reportTemplates`) del §13.1: el formato, no su contenido.
 *
 * `SER-FOR-002` es un código de documento controlado por Calidad. Se separa de
 * sus versiones porque el código sobrevive a todas ellas: los informes de 2024
 * y los de 2027 son ambos SER-FOR-002 aunque su estructura haya cambiado.
 */
@Schema({ collection: 'reportTemplates', timestamps: true })
export class ReportTemplate {
  @Prop({ type: String, required: true, uppercase: true, trim: true })
  codigo!: string;

  @Prop({ type: String, required: true, trim: true })
  nombre!: string;

  @Prop({ type: String, default: null })
  descripcion!: string | null;

  @Prop({ type: Boolean, default: true })
  activo!: boolean;

  @Prop({ type: Date, default: null })
  deletedAt!: Date | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  createdBy!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  updatedBy!: Types.ObjectId | null;
}

export type ReportTemplateDocument = ReportTemplate & Document;
export const ReportTemplateSchema = SchemaFactory.createForClass(ReportTemplate);

ReportTemplateSchema.index({ codigo: 1 }, { unique: true });

/**
 * Maestro 24 (`templateVersions`).
 *
 * Las secciones y bloques van **embebidos** y no en colecciones aparte porque
 * nunca se leen sueltos: para pintar el wizard o para renderizar el PDF hace
 * falta la versión entera. Partirla en tres colecciones costaría tres consultas
 * para reconstruir siempre lo mismo.
 *
 * Se guardan como `Mixed`: la forma de `config` depende del tipo de bloque, y
 * `validateTemplate` de `libs/shared` ya la comprueba al publicar. Un schema
 * rígido aquí obligaría a migrar la base cada vez que un tipo de bloque gane un
 * ajuste, que es exactamente la rigidez de la que queremos salir.
 */
@Schema({ collection: 'templateVersions', timestamps: true })
export class TemplateVersion {
  @Prop({ type: Types.ObjectId, ref: 'ReportTemplate', required: true })
  templateId!: Types.ObjectId;

  /** El código se repite aquí para no tener que resolver la referencia al leer. */
  @Prop({ type: String, required: true, uppercase: true, trim: true })
  codigo!: string;

  @Prop({ type: String, required: true, trim: true })
  version!: string;

  @Prop({ type: String, required: true, trim: true })
  nombre!: string;

  @Prop({ type: String, enum: ['borrador', 'publicada', 'retirada'], default: 'borrador' })
  estado!: TemplateStatus;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true, default: [] })
  secciones!: TemplateSectionDefinition[];

  @Prop({ type: Date, default: null })
  fechaPublicacion!: Date | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  publicadaPor!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  createdBy!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  updatedBy!: Types.ObjectId | null;
}

export type TemplateVersionDocument = TemplateVersion & Document;
export const TemplateVersionSchema = SchemaFactory.createForClass(TemplateVersion);

TemplateVersionSchema.index({ codigo: 1, version: 1 }, { unique: true });
TemplateVersionSchema.index({ codigo: 1, estado: 1, fechaPublicacion: -1 });

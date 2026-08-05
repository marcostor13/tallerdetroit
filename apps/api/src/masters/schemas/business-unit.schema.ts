import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Maestro 14 (`businessUnits`) del §13.1.
 *
 * El prefijo se usa al generar el número de orden de trabajo. Los patrones
 * reales observados en los informes son `LIM-TAL-000898` (taller) y
 * `LIM-SCA-001398` (servicio de campo): `{ciudad}-{prefijo}-{correlativo}`.
 */
@Schema({ collection: 'businessUnits', timestamps: true })
export class BusinessUnit {
  // El índice único se declara abajo con `schema.index()`, no aquí: ponerlo en
  // ambos sitios lo crea por duplicado y Mongoose avisa en cada arranque.
  @Prop({ type: String, required: true, uppercase: true, trim: true })
  codigo!: string;

  @Prop({ type: String, required: true, trim: true })
  nombre!: string;

  /** Segmento que aparece en el correlativo de la OT. */
  @Prop({ type: String, required: true, uppercase: true, trim: true })
  prefijoOt!: string;

  /** Segmento de ciudad del correlativo (p. ej. `LIM`). */
  @Prop({ type: String, default: 'LIM', uppercase: true, trim: true })
  ciudad!: string;

  @Prop({ type: Boolean, default: true })
  activo!: boolean;

  @Prop({ type: Types.ObjectId, ref: 'Organization', default: null })
  organizacionId!: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  deletedAt!: Date | null;
}

export type BusinessUnitDocument = BusinessUnit & Document;

export const BusinessUnitSchema = SchemaFactory.createForClass(BusinessUnit);

BusinessUnitSchema.index({ codigo: 1 }, { unique: true });
BusinessUnitSchema.index({ activo: 1 });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';

/** Dónde se prestó el servicio. En los informes: `TALLER - LIMA`, `Callao – Lima`. */
export const SITE_TYPES = ['taller', 'campo', 'mina', 'planta', 'puerto', 'otro'] as const;
export type SiteType = (typeof SITE_TYPES)[number];

/**
 * Maestro 2 (`sites`) del §13.1.
 *
 * Una sede pertenece a un cliente, salvo las propias del taller, que se
 * registran sin cliente y sirven para los servicios internos.
 */
@Schema({ collection: 'sites', timestamps: true })
export class Site {
  @Prop({ type: String, required: true, trim: true })
  nombre!: string;

  /** Nulo en las sedes propias (p. ej. `TALLER - LIMA`). */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Client', default: null })
  clienteId!: Types.ObjectId | null;

  @Prop({ type: String, default: null, trim: true })
  ciudad!: string | null;

  @Prop({ type: String, enum: SITE_TYPES, default: 'otro' })
  tipo!: SiteType;

  @Prop({ type: String, default: null })
  direccion!: string | null;

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

export type SiteDocument = Site & Document;

export const SiteSchema = SchemaFactory.createForClass(Site);

// La cascada del wizard filtra sedes por cliente: este índice la sostiene.
SiteSchema.index({ clienteId: 1, activo: 1 });
SiteSchema.index({ nombre: 'text', ciudad: 'text' });

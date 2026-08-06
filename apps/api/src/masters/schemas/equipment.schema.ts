import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export const EQUIPMENT_CATEGORIES = [
  'camion_minero',
  'grupo_electrogeno',
  'embarcacion',
  'maquinaria',
  'otro',
] as const;
export type EquipmentCategory = (typeof EQUIPMENT_CATEGORIES)[number];

/**
 * Maestro 3 (`equipments`) del §13.1.
 *
 * En los informes reales: `VQT-33`, `VQT-130` (camiones KOMATSU 930E4-SE),
 * `Facility 1220`, `EP. TASA 411`.
 *
 * La categoría gobierna la visibilidad condicional (§11.3): el panel de
 * parámetros ECU solo tiene sentido en un grupo electrógeno, y hoy el prototipo
 * lo muestra siempre, incluso evaluando el motor de un camión minero.
 */
@Schema({ collection: 'equipments', timestamps: true })
export class Equipment {
  /** Código con el que lo conoce el cliente. Clave natural dentro del cliente. */
  @Prop({ type: String, required: true, uppercase: true, trim: true })
  codigo!: string;

  @Prop({ type: Types.ObjectId, ref: 'Client', required: true })
  clienteId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Site', default: null })
  sedeId!: Types.ObjectId | null;

  @Prop({ type: String, enum: EQUIPMENT_CATEGORIES, default: 'otro' })
  categoria!: EquipmentCategory;

  @Prop({ type: Types.ObjectId, ref: 'EquipmentBrand', default: null })
  marcaId!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'EquipmentModel', default: null })
  modeloId!: Types.ObjectId | null;

  /** Motor montado ahora. La cascada del wizard lo propone al elegir el equipo. */
  @Prop({ type: Types.ObjectId, ref: 'Engine', default: null })
  motorActualId!: Types.ObjectId | null;

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

export type EquipmentDocument = Equipment & Document;

export const EquipmentSchema = SchemaFactory.createForClass(Equipment);

// El mismo código puede repetirse entre clientes distintos, pero no dentro de uno.
EquipmentSchema.index({ clienteId: 1, codigo: 1 }, { unique: true });
EquipmentSchema.index({ clienteId: 1, sedeId: 1, activo: 1 });
EquipmentSchema.index({ motorActualId: 1 });
EquipmentSchema.index({ codigo: 'text' });

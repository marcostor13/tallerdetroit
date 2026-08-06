import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Catálogos simples de F1. Comparten forma —nombre, activo, soft delete— así que
 * se declaran juntos en lugar de repetir un archivo por cada uno.
 */

/** Campos que lleva todo maestro. */
@Schema()
class BaseMaster {
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

// ---------------------------------------------------------------- Marcas

/** Maestro 6 (`engineBrands`): MTU, CAT. */
@Schema({ collection: 'engineBrands', timestamps: true })
export class EngineBrand extends BaseMaster {
  @Prop({ type: String, required: true, uppercase: true, trim: true })
  nombre!: string;
}
export type EngineBrandDocument = EngineBrand & Document;
export const EngineBrandSchema = SchemaFactory.createForClass(EngineBrand);
EngineBrandSchema.index({ nombre: 1 }, { unique: true });
EngineBrandSchema.index({ nombre: 'text' });

/**
 * Maestro 4 (`equipmentBrands`): KOMATSU.
 * Los informes traen `KOMATZU` escrito así por error; ese typo real es el que
 * justifica la búsqueda tolerante de §13.3.2.
 */
@Schema({ collection: 'equipmentBrands', timestamps: true })
export class EquipmentBrand extends BaseMaster {
  @Prop({ type: String, required: true, uppercase: true, trim: true })
  nombre!: string;
}
export type EquipmentBrandDocument = EquipmentBrand & Document;
export const EquipmentBrandSchema = SchemaFactory.createForClass(EquipmentBrand);
EquipmentBrandSchema.index({ nombre: 1 }, { unique: true });
EquipmentBrandSchema.index({ nombre: 'text' });

/** Maestro 5 (`equipmentModels`): 930E4-SE. */
@Schema({ collection: 'equipmentModels', timestamps: true })
export class EquipmentModel extends BaseMaster {
  @Prop({ type: Types.ObjectId, ref: 'EquipmentBrand', required: true })
  marcaId!: Types.ObjectId;

  @Prop({ type: String, required: true, uppercase: true, trim: true })
  denominacion!: string;
}
export type EquipmentModelDocument = EquipmentModel & Document;
export const EquipmentModelSchema = SchemaFactory.createForClass(EquipmentModel);
EquipmentModelSchema.index({ marcaId: 1, denominacion: 1 }, { unique: true });
EquipmentModelSchema.index({ denominacion: 'text' });

// ------------------------------------------------------------ Intervención

/**
 * Maestro 10 (`interventionTypes`): QL4, W6, W6-1.
 *
 * En los informes reales el motivo es `QL4 / W6-1`, y de él depende qué bloques
 * aparecen: el OT746 (W6-1) trae seguidores y varillas; el OT898 (QL4), turbos y
 * housing posterior.
 */
@Schema({ collection: 'interventionTypes', timestamps: true })
export class InterventionType extends BaseMaster {
  @Prop({ type: String, required: true, uppercase: true, trim: true })
  codigo!: string;

  @Prop({ type: String, required: true, trim: true })
  descripcion!: string;

  @Prop({ type: String, default: null })
  alcance!: string | null;

  /** Cada cuántas horas de motor corresponde, si es periódica. */
  @Prop({ type: Number, default: null })
  periodicidadHoras!: number | null;

  @Prop({ type: Types.ObjectId, ref: 'ReportTemplate', default: null })
  plantillaSugeridaId!: Types.ObjectId | null;
}
export type InterventionTypeDocument = InterventionType & Document;
export const InterventionTypeSchema = SchemaFactory.createForClass(InterventionType);
InterventionTypeSchema.index({ codigo: 1 }, { unique: true });
InterventionTypeSchema.index({ codigo: 'text', descripcion: 'text' });

// -------------------------------------------------------------- Personas

/** Maestro 13 (`positions`): SUPERVISOR C, JEFE DE TALLER, TÉCNICO SENIOR. */
@Schema({ collection: 'positions', timestamps: true })
export class Position extends BaseMaster {
  @Prop({ type: String, required: true, uppercase: true, trim: true })
  denominacion!: string;

  /** Para ordenar jerárquicamente en los desplegables. */
  @Prop({ type: Number, default: 0 })
  nivel!: number;
}
export type PositionDocument = Position & Document;
export const PositionSchema = SchemaFactory.createForClass(Position);
PositionSchema.index({ denominacion: 1 }, { unique: true });
PositionSchema.index({ denominacion: 'text' });

/**
 * Maestro 12 (`technicians`): REYNALDO CÁCERES / TÉCNICO SENIOR.
 *
 * Separado de `users` a propósito: hay técnicos que firman informes sin tener
 * cuenta en la plataforma, y usuarios (administración, calidad) que no son
 * técnicos.
 */
@Schema({ collection: 'technicians', timestamps: true })
export class Technician extends BaseMaster {
  @Prop({ type: String, required: true, trim: true })
  nombre!: string;

  @Prop({ type: String, default: null, trim: true })
  dni!: string | null;

  @Prop({ type: Types.ObjectId, ref: 'Position', default: null })
  cargoId!: Types.ObjectId | null;

  /** Cargo congelado tal como se imprime en el informe. */
  @Prop({ type: String, default: null, trim: true })
  cargo!: string | null;

  @Prop({ type: String, default: null })
  categoria!: string | null;

  @Prop({ type: String, default: null })
  especialidad!: string | null;

  /** Firma dibujada en pantalla (decisión D6), guardada en S3. */
  @Prop({ type: String, default: null })
  firmaS3Key!: string | null;

  @Prop({ type: Types.ObjectId, ref: 'BusinessUnit', default: null })
  unidadNegocioId!: Types.ObjectId | null;
}
export type TechnicianDocument = Technician & Document;
export const TechnicianSchema = SchemaFactory.createForClass(Technician);
TechnicianSchema.index({ dni: 1 }, { unique: true, sparse: true });
TechnicianSchema.index({ nombre: 'text' });
TechnicianSchema.index({ unidadNegocioId: 1, activo: 1 });

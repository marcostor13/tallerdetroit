import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';
import type { MeasurementMode } from '@dps/shared';

/**
 * Maestro 9 (`engineSpecs`) del §12.5: qué es tolerable en cada parámetro.
 *
 * Es la pieza que convierte una medición en un dato con significado. Hoy el
 * técnico compara mentalmente contra el manual del fabricante; aquí la
 * comparación la hace la plataforma, y por eso un valor mal cargado no produce
 * un aviso: produce un informe que da por bueno un motor que no lo está.
 *
 * De ahí `provisional`. Las seis especificaciones que conocemos salen de los
 * informes OT-746 y OT-898, **no del manual MTU** (decisión D1: carga manual).
 * Mientras Jefatura técnica no las contraste, van marcadas, y quien las use
 * tiene que ver que lo son.
 */
@Schema({ collection: 'engineSpecs', timestamps: true })
export class EngineSpec {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'EngineModel', required: true })
  engineModelId!: Types.ObjectId;

  /** Clave estable del parámetro: `encaje_camisa_inferior`, `taladro_tunel_bancada`. */
  @Prop({ type: String, required: true, trim: true, lowercase: true })
  parametro!: string;

  /** Cómo se llama en el informe impreso. */
  @Prop({ type: String, default: null, trim: true })
  denominacion!: string | null;

  @Prop({ type: Number, required: true })
  nominal!: number;

  /**
   * Tolerancias con **signo**, tal como las escribe el fabricante: `0` y
   * `+0.08`, o `−0.05` y `0`. Guardarlas como magnitudes obligaría a saber
   * aparte hacia qué lado aplica cada una.
   */
  @Prop({ type: Number, required: true })
  tolInf!: number;

  @Prop({ type: Number, required: true })
  tolSup!: number;

  @Prop({ type: String, required: true, default: 'mm', trim: true })
  unidad!: string;

  /** De dónde salió: `Manual MTU S4000`, `Informe OT746`. */
  @Prop({ type: String, required: true, trim: true })
  fuente!: string;

  /**
   * Cómo se teclea el valor (decisión D2). Los muñones del cigüeñal se anotan
   * como desviación —`−0.01` es una centésima por debajo del nominal—, no como
   * medida directa.
   */
  @Prop({ type: String, enum: ['absoluto', 'desviacion'], default: 'absoluto' })
  modo!: MeasurementMode;

  /** Sin validar contra el manual del fabricante (D1). */
  @Prop({ type: Boolean, default: true })
  provisional!: boolean;

  @Prop({ type: String, default: null })
  observaciones!: string | null;

  @Prop({ type: Boolean, default: false })
  pendienteValidacion!: boolean;

  @Prop({ type: Boolean, default: true })
  activo!: boolean;

  @Prop({ type: Date, default: null })
  deletedAt!: Date | null;

  @Prop({ type: SchemaTypes.ObjectId, default: null })
  fusionadoEn!: Types.ObjectId | null;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', default: null })
  createdBy!: Types.ObjectId | null;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', default: null })
  updatedBy!: Types.ObjectId | null;
}

export type EngineSpecDocument = EngineSpec & Document;
export const EngineSpecSchema = SchemaFactory.createForClass(EngineSpec);

/**
 * Un modelo de motor no puede tener dos tolerancias para el mismo parámetro.
 *
 * Es el índice que impide el peor fallo posible de este maestro: dos criterios
 * distintos conviviendo, y la validación aplicando el que encuentre primero.
 */
EngineSpecSchema.index({ engineModelId: 1, parametro: 1 }, { unique: true });
EngineSpecSchema.index({ provisional: 1 });
EngineSpecSchema.index({ parametro: 'text', denominacion: 'text' });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';

/**
 * Colección analítica (§16.3): una fila por valor medido, escrita **al emitir**.
 *
 * Es el activo de datos que hoy se pierde. Cada intervención mide los mismos
 * parámetros del mismo motor, pero los valores quedan enterrados dentro de un
 * Word: nadie puede responder «cómo ha evolucionado el juego axial del cigüeñal
 * del 5282011236» sin abrir a mano todos sus informes.
 *
 * Está deliberadamente **desnormalizada**. Repite la serie del motor, el código
 * del equipo y la tolerancia aplicada en cada fila porque la consulta que tiene
 * que servir —una curva de desgaste de años— no puede depender de resolver
 * referencias contra maestros que entretanto han cambiado. Un informe de 2024
 * debe seguir diciendo contra qué se midió en 2024.
 *
 * Se escribe solo al emitir: un borrador cambia mientras se redacta y sus
 * valores no son un hecho todavía.
 */
@Schema({ collection: 'measurementFacts', timestamps: { createdAt: true, updatedAt: false } })
export class MeasurementFact {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Report', required: true })
  reportId!: Types.ObjectId;

  @Prop({ type: String, required: true })
  numeroInforme!: string;

  @Prop({ type: Date, required: true })
  fechaEmision!: Date;

  // --- Motor: es el eje de la serie histórica ---

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Engine', default: null })
  motorId!: Types.ObjectId | null;

  /** La serie identifica al motor a lo largo de los años, aunque cambie de equipo. */
  @Prop({ type: String, default: null })
  motorSerie!: string | null;

  @Prop({ type: String, default: null })
  modeloMotor!: string | null;

  // --- Equipo y cliente ---

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Equipment', default: null })
  equipoId!: Types.ObjectId | null;

  @Prop({ type: String, default: null })
  equipoCodigo!: string | null;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Client', default: null })
  clienteId!: Types.ObjectId | null;

  // --- La medición ---

  /** Clave del parámetro: `taladro_tunel_bancada`, `encaje_camisa_inferior`. */
  @Prop({ type: String, required: true })
  parametro!: string;

  @Prop({ type: String, required: true })
  fila!: string;

  @Prop({ type: String, required: true })
  columna!: string;

  /**
   * Valor **absoluto**, no el que se tecleó.
   *
   * Los muñones se anotan como desviación (`−0.01`) y los encajes como medida
   * directa (decisión D2). Una curva de desgaste que mezclara ambas formas no
   * significaría nada, así que aquí siempre va el diámetro real.
   */
  @Prop({ type: Number, required: true })
  valor!: number;

  @Prop({ type: String, required: true, default: 'mm' })
  unidad!: string;

  // --- Tolerancia con la que se evaluó, copiada ---

  @Prop({ type: Number, default: null })
  nominal!: number | null;

  @Prop({ type: Number, default: null })
  tolInf!: number | null;

  @Prop({ type: Number, default: null })
  tolSup!: number | null;

  @Prop({ type: String, default: null })
  estado!: string | null;

  /** Estaba sin contrastar contra el manual al medir (D1). */
  @Prop({ type: Boolean, default: false })
  specProvisional!: boolean;

  /** Horas del motor al momento de la intervención: es el eje X de la curva. */
  @Prop({ type: Number, default: null })
  horasMotor!: number | null;
}

export type MeasurementFactDocument = MeasurementFact & Document;
export const MeasurementFactSchema = SchemaFactory.createForClass(MeasurementFact);

// §16.3. El primero sirve la consulta objetivo —«evolución del juego axial del
// cigüeñal del motor 5282011236»— con un solo índice.
MeasurementFactSchema.index({ motorSerie: 1, parametro: 1, fechaEmision: 1 });
MeasurementFactSchema.index({ modeloMotor: 1, parametro: 1 });
MeasurementFactSchema.index({ estado: 1, fechaEmision: -1 });

// Reemitir un informe no puede duplicar sus hechos.
MeasurementFactSchema.index({ reportId: 1, parametro: 1, fila: 1, columna: 1 }, { unique: true });

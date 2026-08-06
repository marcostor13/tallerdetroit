import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';

export const ENGINE_STATES = ['operativo', 'en_taller', 'reparacion', 'baja'] as const;
export type EngineState = (typeof ENGINE_STATES)[number];

/** Dónde ha estado montado el motor a lo largo de su vida. */
@Schema({ _id: false })
export class EngineInstallation {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Equipment', required: true })
  equipoId!: Types.ObjectId;

  /** Código del equipo al momento del montaje, congelado. */
  @Prop({ type: String, required: true })
  equipoCodigo!: string;

  @Prop({ type: Date, required: true })
  desde!: Date;

  @Prop({ type: Date, default: null })
  hasta!: Date | null;

  @Prop({ type: Number, default: null })
  horasAlMontar!: number | null;
}

/**
 * Maestro 8 (`engines`) del §13.1.
 *
 * El **número de serie es la clave natural** y el eje de toda la analítica: es
 * lo que permite responder «cómo ha evolucionado el juego axial del cigüeñal del
 * motor 5272012973 en sus últimas tres intervenciones», que hoy es imposible.
 *
 * Un motor sobrevive a los equipos en los que se monta: por eso el historial de
 * instalaciones va embebido aquí y no en el equipo.
 */
@Schema({ collection: 'engines', timestamps: true })
export class Engine {
  /** Clave natural. En los informes: `5272012973`, `5282011236`. */
  @Prop({ type: String, required: true, trim: true })
  serie!: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'EngineModel', required: true })
  modeloId!: Types.ObjectId;

  /** Equipo en el que está montado ahora. Nulo si está suelto en taller. */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Equipment', default: null })
  equipoActualId!: Types.ObjectId | null;

  /** Horas acumuladas. RN-05: no pueden decrecer entre informes. */
  @Prop({ type: Number, default: null, min: 0 })
  horasTotales!: number | null;

  @Prop({ type: String, enum: ENGINE_STATES, default: 'operativo' })
  estado!: EngineState;

  @Prop({ type: [EngineInstallation], default: [] })
  historialInstalaciones!: EngineInstallation[];

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

export type EngineDocument = Engine & Document;

export const EngineSchema = SchemaFactory.createForClass(Engine);

// La serie identifica el motor de forma única en toda la flota.
EngineSchema.index({ serie: 1 }, { unique: true });
EngineSchema.index({ modeloId: 1, estado: 1 });
EngineSchema.index({ equipoActualId: 1 });
EngineSchema.index({ serie: 'text' });

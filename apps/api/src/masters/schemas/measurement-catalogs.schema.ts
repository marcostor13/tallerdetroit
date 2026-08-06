import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';
import { Schema as MongooseSchema } from 'mongoose';
import { COMPONENT_VERDICTS } from '@dps/shared';

/**
 * Catálogos que sostienen el módulo de mediciones (§12).
 *
 * Comparten forma con los demás maestros, así que van juntos en lugar de en un
 * archivo por cabeza.
 */

/** Campos comunes a todo maestro. */
@Schema()
class BaseMaster {
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

/**
 * Maestro 11 (`engineComponents`): las piezas que se evalúan.
 *
 * Un bloque de trabajo apunta aquí, y de esa referencia salen la analítica de
 * F5 —«todos los encajes de camisa fuera de tolerancia en motores 4000»— y el
 * pre-poblado de conclusiones. Mientras sea texto libre en el título del
 * bloque, ninguna de las dos cosas es posible.
 */
@Schema({ collection: 'engineComponents', timestamps: true })
export class EngineComponent extends BaseMaster {
  /** Clave estable: `cigueñal`, `camisa`, `culata`, `piston`. */
  @Prop({ type: String, required: true, trim: true, lowercase: true })
  clave!: string;

  @Prop({ type: String, required: true, trim: true })
  denominacion!: string;

  /** Para agrupar en el informe: `bloque`, `tren_alternativo`, `distribucion`. */
  @Prop({ type: String, default: null, trim: true })
  grupo!: string | null;

  /**
   * Componente padre, cuando lo hay: una camisa pertenece al bloque.
   * Se guarda la jerarquía porque la analítica agrupa por conjunto, no solo
   * por pieza suelta.
   */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'EngineComponent', default: null })
  padreId!: Types.ObjectId | null;

  /** Cuántas unidades lleva el motor, si es un número fijo. */
  @Prop({ type: Number, default: null })
  cantidadPorMotor!: number | null;

  /** Qué se deriva del modelo de motor: `cilindros`, `apoyosBancada`. */
  @Prop({ type: String, default: null })
  cantidadDerivadaDe!: string | null;
}
export type EngineComponentDocument = EngineComponent & Document;
export const EngineComponentSchema = SchemaFactory.createForClass(EngineComponent);
EngineComponentSchema.index({ clave: 1 }, { unique: true });
EngineComponentSchema.index({ grupo: 1, denominacion: 1 });
EngineComponentSchema.index({ denominacion: 'text', clave: 'text' });

/**
 * Maestro (`units`): unidades de medida.
 *
 * Existe como maestro y no como texto libre por un motivo concreto: los
 * informes traen milímetros y pulgadas, y una analítica que sume ambos sin
 * saberlo produce números sin sentido. El factor a la unidad base permite
 * comparar mediciones tomadas con instrumentos distintos.
 */
@Schema({ collection: 'units', timestamps: true })
export class Unit extends BaseMaster {
  /** Símbolo tal como se imprime: `mm`, `in`, `°C`, `bar`. */
  @Prop({ type: String, required: true, trim: true })
  simbolo!: string;

  @Prop({ type: String, required: true, trim: true })
  denominacion!: string;

  /** `longitud`, `temperatura`, `presion`, `par`. */
  @Prop({ type: String, required: true, trim: true, lowercase: true })
  magnitud!: string;

  /** Unidad base de su magnitud, contra la que se convierte. */
  @Prop({ type: Boolean, default: false })
  esBase!: boolean;

  /** Cuánto vale una unidad de esta en la base: `in` → 25.4 con base `mm`. */
  @Prop({ type: Number, default: 1 })
  factorABase!: number;

  /** Decimales con los que se muestra. Una medición en mm lleva tres. */
  @Prop({ type: Number, default: 2 })
  decimales!: number;
}
export type UnitDocument = Unit & Document;
export const UnitSchema = SchemaFactory.createForClass(Unit);
UnitSchema.index({ simbolo: 1 }, { unique: true });
UnitSchema.index({ magnitud: 1, esBase: -1 });

/**
 * Maestro (`componentVerdicts`): el dictamen sobre una pieza.
 *
 * Los cuatro valores viven en `libs/shared` porque el motor de tolerancias los
 * propone, pero aquí son un maestro editable: el negocio decide qué texto sale
 * impreso y qué acción sugiere cada uno, sin tocar código.
 */
@Schema({ collection: 'componentVerdicts', timestamps: true })
export class ComponentVerdictMaster extends BaseMaster {
  @Prop({ type: String, required: true, enum: COMPONENT_VERDICTS, trim: true })
  clave!: string;

  @Prop({ type: String, required: true, trim: true })
  denominacion!: string;

  /** Qué hacer con la pieza; alimenta el pre-poblado de conclusiones (§12.4.4). */
  @Prop({ type: String, default: null, trim: true })
  accionSugerida!: string | null;

  /**
   * Con cuál se pintan los chips y las conclusiones. Solo nombres semánticos
   * del sistema de diseño: aquí no entra un hexadecimal.
   */
  @Prop({ type: String, enum: ['success', 'warning', 'danger', 'neutral'], default: 'neutral' })
  tono!: string;

  /** Para ordenarlos de menos a más grave en los desplegables. */
  @Prop({ type: Number, default: 0 })
  gravedad!: number;
}
export type ComponentVerdictDocument = ComponentVerdictMaster & Document;
export const ComponentVerdictSchema = SchemaFactory.createForClass(ComponentVerdictMaster);
ComponentVerdictSchema.index({ clave: 1 }, { unique: true });

/**
 * Maestro 29 (`checklists`): el inventario de desarmado (SER-T-FOR-002).
 *
 * D4 quedó resuelta en sección dentro del mismo informe, no en documento
 * aparte. Este maestro guarda **qué se inventaría**, no lo inventariado: lo
 * capturado vive en el bloque del informe, como el resto.
 *
 * Como documento independiente, el inventario se firmaría en un sitio y el
 * informe en otro, y acabarían contando cosas distintas del mismo motor.
 */
@Schema({ collection: 'checklists', timestamps: true })
export class Checklist extends BaseMaster {
  @Prop({ type: String, required: true, trim: true, lowercase: true })
  clave!: string;

  @Prop({ type: String, required: true, trim: true })
  denominacion!: string;

  /** Código del formato del que sale: `SER-T-FOR-002`. */
  @Prop({ type: String, default: null, trim: true })
  formato!: string | null;

  /**
   * Modelos de motor a los que aplica. Vacío significa todos: la mayoría de
   * los inventarios sirven para cualquier motor de la familia.
   */
  @Prop({ type: [SchemaTypes.ObjectId], ref: 'EngineModel', default: [] })
  aplicaAModelos!: Types.ObjectId[];

  /**
   * Ítems, con su cantidad esperada o el campo del motor del que se deriva.
   * Van embebidos porque nunca se leen sueltos: para pintar el bloque hace
   * falta la lista entera.
   */
  @Prop({ type: MongooseSchema.Types.Mixed, default: [] })
  items!: Record<string, unknown>[];
}
export type ChecklistDocument = Checklist & Document;
export const ChecklistSchema = SchemaFactory.createForClass(Checklist);
ChecklistSchema.index({ clave: 1 }, { unique: true });
ChecklistSchema.index({ denominacion: 'text' });

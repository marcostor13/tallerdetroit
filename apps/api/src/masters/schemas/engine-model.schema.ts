import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';

/**
 * Maestro 7 (`engineModels`) del §13.1. **Es el maestro más crítico de todos.**
 *
 * De aquí salen las dimensiones de cada grilla de medición (§12.2): el número de
 * columnas no se configura a mano, se deriva del modelo. Un dato mal cargado
 * produce una grilla incorrecta y, con ella, mediciones mal validadas.
 *
 *   MTU 16V4000C21 → 16 cilindros,  9 apoyos → muñón de bancada con  9 columnas
 *   MTU 20V4000C23 → 20 cilindros, 11 apoyos → muñón de bancada con 11 columnas
 */
@Schema({ collection: 'engineModels', timestamps: true })
export class EngineModel {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'EngineBrand', required: true })
  marcaId!: Types.ObjectId;

  /** Denominación del fabricante: `16V4000C21`, `20V4000C23`, `8V4000M60R`. */
  @Prop({ type: String, required: true, uppercase: true, trim: true })
  denominacion!: string;

  // --- Geometría: de estos tres campos dependen todas las grillas ---

  @Prop({ type: Number, required: true, min: 1 })
  cilindros!: number;

  /** Bancos del motor. En una V son 2; en línea, 1. */
  @Prop({ type: Number, required: true, min: 1, default: 2 })
  bancos!: number;

  /** Apoyos de bancada: define las columnas de muñón de bancada y coaxialidad. */
  @Prop({ type: Number, required: true, min: 1 })
  apoyosBancada!: number;

  @Prop({ type: String, default: null, trim: true })
  configuracion!: string | null;

  // --- Ficha técnica ---

  @Prop({ type: String, default: null, trim: true })
  potencia!: string | null;

  @Prop({ type: Number, default: null })
  rpm!: number | null;

  // --- Presencia de componentes: gobierna la visibilidad condicional (§11.3) ---

  /** Enfriador de aire de carga. Si no lo tiene, no se pide su prueba hidrostática. */
  @Prop({ type: Boolean, default: false })
  tieneCac!: boolean;

  @Prop({ type: Boolean, default: false })
  tieneTurbos!: boolean;

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

export type EngineModelDocument = EngineModel & Document;

export const EngineModelSchema = SchemaFactory.createForClass(EngineModel);

EngineModelSchema.index({ marcaId: 1, denominacion: 1 }, { unique: true });
EngineModelSchema.index({ denominacion: 'text' });

// Los cilindros por banco NO se exponen aquí. Como virtual desaparecían en
// cuanto la consulta usaba `lean()` —que es lo que hace el servicio de
// maestros—, así que existían en unas rutas y no en otras. Se derivan con
// `cylindersPerBank` de `libs/shared`, que es la misma función que usa
// `resolveColumns` para calcular las columnas de la grilla.

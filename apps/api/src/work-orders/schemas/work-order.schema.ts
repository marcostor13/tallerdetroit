import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';

export const WORK_ORDER_STATES = ['abierta', 'en_proceso', 'cerrada', 'anulada'] as const;
export type WorkOrderState = (typeof WORK_ORDER_STATES)[number];

/**
 * Orden de trabajo (§16.2).
 *
 * Hoy el número de O/T es texto libre dentro del Word y no ata nada. Aquí es una
 * entidad con la que se relacionan uno o varios informes: una misma OT puede
 * generar el informe de evaluación y luego el de reparación, y hasta ahora no
 * había forma de saber que hablaban del mismo trabajo.
 *
 * El número lo escribe el usuario mientras D3 siga sin fijar la convención de
 * correlativos. La plataforma lo normaliza y garantiza que no se repita.
 */
@Schema({ collection: 'workOrders', timestamps: true })
export class WorkOrder {
  @Prop({ type: String, required: true, trim: true })
  numero!: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Client', required: true })
  clienteId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Site', default: null })
  sedeId!: Types.ObjectId | null;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Equipment', default: null })
  equipoId!: Types.ObjectId | null;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Engine', default: null })
  motorId!: Types.ObjectId | null;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'InterventionType', default: null })
  tipoIntervencionId!: Types.ObjectId | null;

  @Prop({ type: String, default: null, trim: true })
  descripcion!: string | null;

  @Prop({ type: String, enum: WORK_ORDER_STATES, default: 'abierta' })
  estado!: WorkOrderState;

  @Prop({ type: Date, default: null })
  fechaApertura!: Date | null;

  @Prop({ type: Date, default: null })
  fechaCierre!: Date | null;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'BusinessUnit', default: null })
  unidadNegocioId!: Types.ObjectId | null;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Organization', default: null })
  organizacionId!: Types.ObjectId | null;

  @Prop({ type: Boolean, default: true })
  activo!: boolean;

  @Prop({ type: Date, default: null })
  deletedAt!: Date | null;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', default: null })
  createdBy!: Types.ObjectId | null;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', default: null })
  updatedBy!: Types.ObjectId | null;
}

export type WorkOrderDocument = WorkOrder & Document;
export const WorkOrderSchema = SchemaFactory.createForClass(WorkOrder);

// La unicidad del número es la razón de ser de esta colección: dos órdenes con
// el mismo número son dos trabajos que la plataforma no puede distinguir.
WorkOrderSchema.index({ numero: 1 }, { unique: true });
WorkOrderSchema.index({ clienteId: 1, estado: 1 });
WorkOrderSchema.index({ equipoId: 1, fechaApertura: -1 });
WorkOrderSchema.index({ estado: 1, unidadNegocioId: 1, fechaApertura: -1 });

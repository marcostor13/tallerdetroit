import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types, SchemaTypes } from 'mongoose';
import type { ReportStatus } from '@dps/shared';

/** Referencia + copia del nombre, para no resolver un `populate` en cada listado. */
@Schema({ _id: false })
export class ReferenciaConNombre {
  @Prop({ type: SchemaTypes.ObjectId, default: null })
  id!: Types.ObjectId | null;

  @Prop({ type: String, default: null })
  nombre!: string | null;
}
const ReferenciaConNombreSchema = SchemaFactory.createForClass(ReferenciaConNombre);

/**
 * Foto de un bloque.
 *
 * `numeroFigura` **no está aquí a propósito**: se deriva del orden de los
 * bloques cada vez que se lee (RN-06). Guardarlo sería guardar un dato que se
 * queda viejo en cuanto el técnico mueve un bloque, que es justo el defecto del
 * Word que hay que eliminar.
 */
@Schema({ _id: false })
export class FotoBloque {
  @Prop({ type: String, required: true })
  id!: string;

  @Prop({ type: String, required: true })
  s3Key!: string;

  @Prop({ type: String, default: null })
  thumbKey!: string | null;

  @Prop({ type: String, default: null })
  printKey!: string | null;

  /** Obligatorio al emitir: una foto sin pie no dice nada en el informe. */
  @Prop({ type: String, default: null })
  caption!: string | null;

  @Prop({ type: Number, default: null })
  ancho!: number | null;

  @Prop({ type: Number, default: null })
  alto!: number | null;

  @Prop({ type: Date, default: null })
  tomadaEn!: Date | null;

  @Prop({ type: String, default: null })
  hash!: string | null;
}
const FotoBloqueSchema = SchemaFactory.createForClass(FotoBloque);

/**
 * Tolerancia **congelada** en el momento de la captura (§12.4.3).
 *
 * No es una referencia a `engineSpecs` sino una copia. Si mañana Jefatura
 * técnica corrige la especificación —y va a corregirlas, porque las de §12.5
 * son provisionales—, los informes ya emitidos tienen que seguir diciendo con
 * qué criterio se evaluaron. Un informe firmado que cambia de veredicto
 * retroactivamente no vale nada.
 */
@Schema({ _id: false })
export class EspecificacionAplicada {
  @Prop({ type: Number, required: true })
  nominal!: number;

  @Prop({ type: Number, required: true })
  tolInf!: number;

  @Prop({ type: Number, required: true })
  tolSup!: number;

  @Prop({ type: String, required: true })
  unidad!: string;

  /** De dónde salió: `Manual MTU S4000`, `Informe OT898`. */
  @Prop({ type: String, required: true })
  fuente!: string;

  /** Estaba sin validar contra el manual del fabricante al capturar (D1). */
  @Prop({ type: Boolean, default: false })
  provisional!: boolean;

  @Prop({ type: String, enum: ['absoluto', 'desviacion'], default: 'absoluto' })
  modo!: string;
}
const EspecificacionAplicadaSchema = SchemaFactory.createForClass(EspecificacionAplicada);

/** Un valor medido dentro de la grilla. */
@Schema({ _id: false })
export class ValorMedido {
  @Prop({ type: String, required: true })
  fila!: string;

  @Prop({ type: String, required: true })
  columna!: string;

  @Prop({ type: Number, default: null })
  valor!: number | null;

  /** `ok`, `alerta` o `fuera`. Lo calcula el backend, nunca llega del cliente. */
  @Prop({ type: String, default: null })
  estado!: string | null;

  @Prop({ type: Boolean, default: false })
  calculado!: boolean;
}
const ValorMedidoSchema = SchemaFactory.createForClass(ValorMedido);

/** Grilla de medición embebida en un bloque (§16.2). */
@Schema({ _id: false })
export class GrillaMedicion {
  /** Código de la plantilla de §12.3: `tunel_bancada`, `muñon_bancada`. */
  @Prop({ type: String, required: true })
  plantilla!: string;

  @Prop({ type: String, required: true })
  nombre!: string;

  @Prop({ type: String, required: true, default: 'mm' })
  unidad!: string;

  @Prop({ type: [String], default: [] })
  filas!: string[];

  @Prop({ type: [String], default: [] })
  columnas!: string[];

  @Prop({ type: [ValorMedidoSchema], default: [] })
  valores!: ValorMedido[];

  @Prop({ type: EspecificacionAplicadaSchema, default: null })
  especificacion!: EspecificacionAplicada | null;

  @Prop({ type: MongooseSchema.Types.Mixed, default: () => ({}) })
  resumen!: Record<string, unknown>;

  /**
   * Por qué se emite pese a tener valores fuera de tolerancia (RN-03).
   *
   * Sin esto, un informe con un encaje fuera de rango saldría igual que uno
   * correcto y nadie sabría que alguien lo revisó y decidió seguir.
   */
  @Prop({ type: String, default: null })
  justificacion!: string | null;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', default: null })
  justificadaPor!: Types.ObjectId | null;
}
const GrillaMedicionSchema = SchemaFactory.createForClass(GrillaMedicion);

/**
 * Inventario de desarmado embebido en un bloque `checklist` (D4).
 *
 * Los ítems van **copiados** del maestro, no referenciados. Es la misma regla
 * que con el resto de maestros: si mañana Calidad añade una pieza al catálogo,
 * un informe ya emitido tiene que seguir diciendo qué se inventarió aquel día,
 * no lo que se inventariaría hoy.
 */
@Schema({ _id: false })
export class ChecklistDelBloque {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Checklist', default: null })
  checklistId!: Types.ObjectId | null;

  @Prop({ type: String, default: null })
  clave!: string | null;

  /** Snapshot del catálogo: clave, denominación, grupo y cantidad esperada. */
  @Prop({ type: MongooseSchema.Types.Mixed, default: [] })
  items!: Record<string, unknown>[];

  /** Lo que el técnico encontró al abrir el motor. */
  @Prop({ type: MongooseSchema.Types.Mixed, default: [] })
  capturado!: Record<string, unknown>[];
}
const ChecklistDelBloqueSchema = SchemaFactory.createForClass(ChecklistDelBloque);

/** Bloque embebido (§16.2). */
@Schema({ _id: false })
export class BloqueInforme {
  @Prop({ type: String, required: true })
  id!: string;

  /** Clave del bloque en la plantilla. Varias instancias comparten clave. */
  @Prop({ type: String, required: true })
  clave!: string;

  @Prop({ type: String, required: true })
  tipo!: string;

  @Prop({ type: Number, required: true })
  orden!: number;

  @Prop({ type: String, default: null })
  titulo!: string | null;

  @Prop({ type: Date, default: null })
  fechaTrabajo!: Date | null;

  @Prop({ type: String, default: null })
  texto!: string | null;

  @Prop({ type: SchemaTypes.ObjectId, default: null })
  componenteId!: Types.ObjectId | null;

  @Prop({ type: String, default: null })
  veredicto!: string | null;

  @Prop({ type: String, default: null })
  accionRecomendada!: string | null;

  @Prop({ type: [FotoBloqueSchema], default: [] })
  fotos!: FotoBloque[];

  /** Grillas dimensionales del bloque (§12). */
  @Prop({ type: [GrillaMedicionSchema], default: [] })
  mediciones!: GrillaMedicion[];

  /** Inventario de desarmado del bloque `checklist` (D4). */
  @Prop({ type: ChecklistDelBloqueSchema, default: null })
  checklist!: ChecklistDelBloque | null;

  /** Contenido propio del tipo: filas de una tabla, viñetas, mediciones… */
  @Prop({ type: MongooseSchema.Types.Mixed, default: null })
  datos!: unknown;

  @Prop({ type: Boolean, default: true })
  visible!: boolean;
}
const BloqueInformeSchema = SchemaFactory.createForClass(BloqueInforme);

/**
 * Documento generado del informe (E3.4).
 *
 * El hash es lo que lo hace verificable: permite demostrar que el PDF que tiene
 * el cliente es el que salió de aquí. Por eso se guarda **el primero que se
 * generó** y no se vuelve a renderizar: reimprimir un informe emitido tiene que
 * devolver byte a byte el mismo archivo, y un render nuevo cambiaría el hash
 * aunque el contenido fuera idéntico —basta con que la fecha de creación del
 * PDF sea otra— y el documento del cliente dejaría de validar (RN-02).
 */
@Schema({ _id: false })
export class DocumentoGenerado {
  @Prop({ type: String, required: true })
  tipo!: string;

  @Prop({ type: String, required: true })
  s3Key!: string;

  /** `sha256:…` del archivo tal como se subió. */
  @Prop({ type: String, required: true })
  hash!: string;

  @Prop({ type: Number, default: null })
  bytes!: number | null;

  @Prop({ type: Date, required: true })
  generadoEn!: Date;
}
const DocumentoGeneradoSchema = SchemaFactory.createForClass(DocumentoGenerado);

/**
 * Comentario de revisión anclado a un bloque (E3.2, UX-08).
 *
 * Va embebido en el informe y no en una colección aparte porque siempre se lee
 * con él: pintar el informe en revisión exige tener los comentarios delante, y
 * una segunda consulta por cada apertura no aporta nada.
 *
 * **Anclado a un bloque**, no suelto al pie. Un «corregir la medición» sin decir
 * cuál obliga al técnico a repasar catorce trabajos para adivinar a qué se
 * refería el supervisor, que es exactamente lo que pasa hoy con los correos.
 */
@Schema({ _id: false })
export class ComentarioDeRevision {
  @Prop({ type: String, required: true })
  id!: string;

  /** `id` del bloque del informe. Nulo solo para un comentario general. */
  @Prop({ type: String, default: null })
  bloqueId!: string | null;

  @Prop({ type: String, required: true, trim: true })
  texto!: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  autorId!: Types.ObjectId;

  /** Denormalizado: el comentario se lee aunque el usuario cause baja. */
  @Prop({ type: String, required: true })
  autorNombre!: string;

  @Prop({ type: Date, required: true })
  fecha!: Date;

  @Prop({ type: Boolean, default: false })
  resuelto!: boolean;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', default: null })
  resueltoPor!: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  resueltoEn!: Date | null;
}
const ComentarioDeRevisionSchema = SchemaFactory.createForClass(ComentarioDeRevision);

@Schema({ _id: false })
export class CambioDeEstado {
  @Prop({ type: String, required: true })
  de!: string;

  @Prop({ type: String, required: true })
  a!: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  usuarioId!: Types.ObjectId;

  @Prop({ type: Date, required: true })
  fecha!: Date;

  @Prop({ type: String, default: null })
  comentario!: string | null;
}
const CambioDeEstadoSchema = SchemaFactory.createForClass(CambioDeEstado);

/**
 * Informe técnico (§16.2).
 *
 * Es el documento que hoy es un Word de 17 MB. Aquí las fotos viven en S3 y solo
 * quedan sus claves, que es lo que permite que el documento de Mongo se mantenga
 * por debajo de 1 MB con 45 fotos —criterio de aceptación de F1—.
 */
@Schema({ collection: 'reports', timestamps: true })
export class Report {
  @Prop({ type: String, required: true, trim: true })
  numeroInforme!: string;

  @Prop({ type: String, default: null, trim: true })
  numeroOt!: string | null;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'WorkOrder', default: null })
  workOrderId!: Types.ObjectId | null;

  @Prop({ type: String, required: true })
  templateCodigo!: string;

  @Prop({ type: String, required: true })
  templateVersion!: string;

  /**
   * Copia congelada de la versión de plantilla, escrita **al emitir** (§11.1).
   * Mientras el informe es borrador se resuelve contra la versión viva; una vez
   * emitido tiene que renderizarse igual para siempre, aunque Calidad publique
   * v02 al día siguiente.
   */
  @Prop({ type: MongooseSchema.Types.Mixed, default: null })
  templateSnapshot!: unknown;

  @Prop({ type: ReferenciaConNombreSchema, default: () => ({}) })
  cliente!: ReferenciaConNombre;

  @Prop({ type: ReferenciaConNombreSchema, default: () => ({}) })
  sede!: ReferenciaConNombre;

  @Prop({ type: MongooseSchema.Types.Mixed, default: () => ({}) })
  equipo!: Record<string, unknown>;

  @Prop({ type: MongooseSchema.Types.Mixed, default: () => ({}) })
  motor!: Record<string, unknown>;

  /** Campos del paso 2 y de las cabeceras: motivo, horas, garantía, fechas… */
  @Prop({ type: MongooseSchema.Types.Mixed, default: () => ({}) })
  datos!: Record<string, unknown>;

  @Prop({ type: [BloqueInformeSchema], default: [] })
  bloques!: BloqueInforme[];

  @Prop({ type: String, default: 'borrador' })
  estado!: ReportStatus;

  @Prop({ type: [CambioDeEstadoSchema], default: [] })
  historialEstados!: CambioDeEstado[];

  /** Comentarios de la revisión, anclados a bloque (E3.2). */
  @Prop({ type: [ComentarioDeRevisionSchema], default: [] })
  comentarios!: ComentarioDeRevision[];

  /**
   * Documentos emitidos, con su hash (E3.4).
   *
   * El primero de cada tipo es el bueno: reimprimir devuelve ese, no uno nuevo.
   */
  @Prop({ type: [DocumentoGeneradoSchema], default: [] })
  documentos!: DocumentoGenerado[];

  /**
   * Autorización del Administrador para emitir pese a un instrumento sin
   * calibración vigente (RN-04).
   *
   * El motivo es obligatorio y queda escrito en el informe, no solo en el log:
   * quien lea el documento dentro de tres años tiene que poder saber que
   * alguien decidió esto y por qué.
   */
  @Prop({ type: MongooseSchema.Types.Mixed, default: null })
  autorizacionCalibracion!: {
    motivo: string;
    autorizadoPor: Types.ObjectId;
    autorizadoPorNombre: string;
    fecha: Date;
  } | null;

  @Prop({ type: Date, default: null })
  fechaEmision!: Date | null;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'BusinessUnit', default: null })
  unidadNegocioId!: Types.ObjectId | null;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Organization', default: null })
  organizacionId!: Types.ObjectId | null;

  /** Quién participa. Determina qué informes ve un técnico (RN-07). */
  @Prop({ type: [SchemaTypes.ObjectId], ref: 'User', default: [] })
  participantesIds!: Types.ObjectId[];

  @Prop({ type: Date, default: null })
  deletedAt!: Date | null;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', default: null })
  createdBy!: Types.ObjectId | null;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', default: null })
  updatedBy!: Types.ObjectId | null;
}

export type ReportDocument = Report & Document;
export const ReportSchema = SchemaFactory.createForClass(Report);

// RN-01 adaptada a D3: sin generador de correlativos, el índice único es lo
// único que impide dos informes indistinguibles.
ReportSchema.index({ numeroInforme: 1 }, { unique: true });
ReportSchema.index({ numeroOt: 1 });
ReportSchema.index({ workOrderId: 1 });
ReportSchema.index({ 'motor.id': 1, fechaEmision: -1 });
ReportSchema.index({ 'equipo.id': 1, fechaEmision: -1 });
ReportSchema.index({ 'cliente.id': 1, estado: 1 });
ReportSchema.index({ estado: 1, unidadNegocioId: 1, fechaEmision: -1 });

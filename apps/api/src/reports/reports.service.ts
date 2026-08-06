import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'node:crypto';
import { Model, Types, type FilterQuery } from 'mongoose';
import {
  REPORT_TRANSITIONS,
  canTransition,
  checkReportNumber,
  figureNumbersById,
  findMissingBlocks,
  isImmutable,
  isRepeatable,
  moveBlock,
  resolveBlocks,
  type BlockType,
  type MissingBlock,
  type Permission,
  type ReportStatus,
  type TemplateVersionDefinition,
} from '@dps/shared';
import { Report, type BloqueInforme, type ReportDocument } from './schemas/report.schema';
import { TemplatesService } from '../templates/templates.service';
import { DocumentsService } from '../documents/documents.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';

export interface ListReportsOptions {
  readonly q?: string;
  readonly estado?: ReportStatus;
  readonly clienteId?: string;
  readonly equipoId?: string;
  readonly motorId?: string;
  readonly tecnicoId?: string;
  readonly desde?: string;
  readonly hasta?: string;
  readonly limit?: number;
}

/** Campos que el cliente no puede escribir: los lleva el servicio. */
const CAMPOS_PROTEGIDOS = new Set([
  '_id',
  'estado',
  'historialEstados',
  'templateSnapshot',
  'fechaEmision',
  'createdBy',
  'createdAt',
  'deletedAt',
]);

@Injectable()
export class ReportsService {
  constructor(
    @InjectModel(Report.name) private readonly informes: Model<ReportDocument>,
    private readonly plantillas: TemplatesService,
    private readonly documentos: DocumentsService,
  ) {}

  // ---------------------------------------------------------------- lectura

  async list(options: ListReportsOptions = {}) {
    const filtro: FilterQuery<ReportDocument> = { deletedAt: null };

    if (options.estado) filtro.estado = options.estado;
    if (options.clienteId) filtro['cliente.id'] = this.comoId(options.clienteId, 'clienteId');
    if (options.equipoId) filtro['equipo.id'] = this.comoId(options.equipoId, 'equipoId');
    if (options.motorId) filtro['motor.id'] = this.comoId(options.motorId, 'motorId');
    if (options.tecnicoId) {
      filtro.participantesIds = this.comoId(options.tecnicoId, 'tecnicoId');
    }

    if (options.desde || options.hasta) {
      const rango: Record<string, Date> = {};
      if (options.desde) rango['$gte'] = new Date(options.desde);
      if (options.hasta) rango['$lte'] = new Date(options.hasta);
      filtro.fechaEmision = rango;
    }

    if (options.q?.trim()) {
      const termino = options.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filtro.$or = [
        { numeroInforme: { $regex: termino, $options: 'i' } },
        { numeroOt: { $regex: termino, $options: 'i' } },
      ];
    }

    const items = await this.informes
      .find(filtro)
      // La bandeja no necesita los bloques: son el 95% del peso del documento y
      // traerlos convertiría un listado de 50 filas en varios megas.
      .select('-bloques -templateSnapshot')
      .sort({ fechaEmision: -1, updatedAt: -1 })
      .limit(Math.min(options.limit ?? 50, 200))
      .lean()
      .exec();

    return { total: items.length, items };
  }

  async findById(id: string) {
    const doc = await this.documento(id);
    return this.conFigurasNumeradas(doc.toObject());
  }

  /** Informes de una orden de trabajo: la relación 1..n de E1.3. */
  async listByWorkOrder(workOrderId: string) {
    const items = await this.informes
      .find({ workOrderId: this.comoId(workOrderId, 'workOrderId'), deletedAt: null })
      .select('-bloques -templateSnapshot')
      .sort({ createdAt: 1 })
      .lean()
      .exec();
    return { total: items.length, items };
  }

  // ------------------------------------------------------------------ alta

  async create(data: Record<string, unknown>, actor: AuthUser) {
    const numeroInforme = this.validarNumero(data['numeroInforme']);
    const codigo = String(data['templateCodigo'] ?? 'SER-FOR-002');

    // Se resuelve la versión vigente al crear y se guarda cuál es: el informe
    // se edita con la estructura con la que nació, aunque Calidad publique otra
    // a media redacción.
    const plantilla = await this.plantillas.vigente(codigo);

    const { templateCodigo, templateVersion, ...resto } = data;
    void templateCodigo;
    void templateVersion;

    try {
      const doc = await this.informes.create({
        ...this.limpiar(resto),
        numeroInforme,
        templateCodigo: plantilla.codigo,
        templateVersion: plantilla.version,
        estado: 'borrador',
        participantesIds: [new Types.ObjectId(actor.id)],
        createdBy: new Types.ObjectId(actor.id),
        updatedBy: new Types.ObjectId(actor.id),
      });
      return doc.toObject();
    } catch (error: unknown) {
      throw this.traducirError(error, numeroInforme);
    }
  }

  // ------------------------------------------------------------ autoguardado

  /**
   * Guardado incremental del wizard (NFR-02: se percibe en menos de 500 ms).
   *
   * Escribe solo los campos que llegan, con `$set` sobre rutas concretas. Enviar
   * el informe entero cada 20 segundos serían varios megas por autoguardado, y
   * además pisaría los cambios que otro haya hecho entretanto en un campo que
   * este cliente ni siquiera tocó.
   */
  async patch(id: string, cambios: Record<string, unknown>, actor: AuthUser) {
    const doc = await this.documento(id);
    this.exigirEditable(doc);

    const set: Record<string, unknown> = { updatedBy: new Types.ObjectId(actor.id) };

    for (const [campo, valor] of Object.entries(cambios)) {
      if (CAMPOS_PROTEGIDOS.has(campo)) continue;

      if (campo === 'numeroInforme') {
        set[campo] = this.validarNumero(valor);
        continue;
      }

      // `datos.horasTotales` en vez de `datos`: así dos pestañas editando
      // campos distintos del mismo paso no se pisan.
      if (campo === 'datos' && valor && typeof valor === 'object') {
        for (const [clave, v] of Object.entries(valor as Record<string, unknown>)) {
          set[`datos.${clave}`] = v;
        }
        continue;
      }

      set[campo] = valor;
    }

    try {
      const actualizado = await this.informes
        .findOneAndUpdate({ _id: doc._id }, { $set: set }, { new: true, runValidators: true })
        .lean()
        .exec();

      return { guardadoEn: new Date().toISOString(), informe: actualizado };
    } catch (error: unknown) {
      throw this.traducirError(error, String(set['numeroInforme'] ?? ''));
    }
  }

  // --------------------------------------------------------------- bloques

  async addBlock(id: string, datos: Record<string, unknown>, actor: AuthUser) {
    const doc = await this.documento(id);
    this.exigirEditable(doc);

    const plantilla = await this.plantillaDe(doc);
    const clave = String(datos['clave'] ?? '');
    const definicion = resolveBlocks(plantilla, this.contexto(doc)).find((b) => b.clave === clave);

    if (!definicion) {
      throw new BadRequestException(
        `La plantilla ${doc.templateCodigo} ${doc.templateVersion} no tiene ningún bloque «${clave}» para este informe.`,
      );
    }

    const yaHay = doc.bloques.filter((b) => b.clave === clave).length;
    if (yaHay > 0 && !isRepeatable(definicion.tipo as BlockType)) {
      throw new ConflictException(
        `El bloque «${definicion.titulo}» no se puede repetir: edita el que ya existe.`,
      );
    }

    const bloque = {
      ...datos,
      id: randomUUID(),
      clave,
      tipo: definicion.tipo,
      orden: doc.bloques.length + 1,
      titulo: datos['titulo'] ?? definicion.titulo,
      visible: true,
    };

    doc.bloques.push(bloque as unknown as BloqueInforme);
    doc.updatedBy = new Types.ObjectId(actor.id);
    await doc.save();

    return this.conFigurasNumeradas(doc.toObject());
  }

  async updateBlock(
    id: string,
    bloqueId: string,
    cambios: Record<string, unknown>,
    actor: AuthUser,
  ) {
    const doc = await this.documento(id);
    this.exigirEditable(doc);

    const bloque = doc.bloques.find((b) => b.id === bloqueId);
    if (!bloque) throw new NotFoundException('No existe ese bloque en el informe.');

    for (const [campo, valor] of Object.entries(cambios)) {
      // Ni el identificador ni el tipo se reescriben: cambiarlos convertiría el
      // bloque en otro distinto y las fotos quedarían huérfanas.
      if (['id', 'clave', 'tipo'].includes(campo)) continue;
      (bloque as unknown as Record<string, unknown>)[campo] = valor;
    }

    doc.updatedBy = new Types.ObjectId(actor.id);
    await doc.save();

    return this.conFigurasNumeradas(doc.toObject());
  }

  async removeBlock(id: string, bloqueId: string, actor: AuthUser) {
    const doc = await this.documento(id);
    this.exigirEditable(doc);

    const antes = doc.bloques.length;
    doc.bloques = doc.bloques.filter((b) => b.id !== bloqueId);
    if (doc.bloques.length === antes) {
      throw new NotFoundException('No existe ese bloque en el informe.');
    }

    // Los órdenes vuelven a ser contiguos y las figuras se renumeran solas.
    doc.bloques = moveBlock(doc.bloques, 0, 0) as unknown as BloqueInforme[];
    doc.updatedBy = new Types.ObjectId(actor.id);
    await doc.save();

    return this.conFigurasNumeradas(doc.toObject());
  }

  /**
   * Reordena por posición (RN-06).
   *
   * Se pasan índices y no órdenes absolutos porque es lo que produce tanto el
   * arrastre con el ratón como el movimiento por teclado, que debe existir para
   * que el wizard se complete sin ratón (T2).
   */
  async reorderBlocks(id: string, desde: number, hasta: number, actor: AuthUser) {
    const doc = await this.documento(id);
    this.exigirEditable(doc);

    doc.bloques = moveBlock(doc.bloques, desde, hasta) as unknown as BloqueInforme[];
    doc.updatedBy = new Types.ObjectId(actor.id);
    await doc.save();

    return this.conFigurasNumeradas(doc.toObject());
  }

  // ------------------------------------------------------------- validación

  /**
   * Qué falta para poder emitir (UX-07).
   *
   * Devuelve la lista completa, no el primer fallo: el requisito es que el
   * técnico vea de una vez todo lo que le queda y pueda ir a cada punto con un
   * clic, en lugar de descubrirlos de uno en uno.
   */
  async validate(id: string): Promise<{ emitible: boolean; faltan: MissingBlock[] }> {
    const doc = await this.documento(id);
    const plantilla = await this.plantillaDe(doc);

    const conDatos = new Set(doc.bloques.filter((b) => this.tieneContenido(b)).map((b) => b.clave));

    const faltan = [...findMissingBlocks(plantilla, this.contexto(doc), conDatos)];

    if (!doc.numeroInforme?.trim()) {
      faltan.push({
        seccion: 'Datos generales',
        clave: 'numeroInforme',
        titulo: 'N° de informe',
        paso: 1,
      });
    }

    // Una foto sin pie no dice nada en el informe, y el pie es lo que se lee
    // debajo de la figura en el PDF.
    for (const bloque of doc.bloques) {
      const sinCaption = (bloque.fotos ?? []).filter((f) => !f.caption?.trim()).length;
      if (sinCaption > 0) {
        faltan.push({
          seccion: bloque.titulo ?? 'Trabajos realizados',
          clave: `${bloque.id}:captions`,
          titulo: `${sinCaption} foto(s) sin pie en «${bloque.titulo ?? bloque.clave}»`,
          paso: 3,
        });
      }
    }

    return { emitible: faltan.length === 0, faltan };
  }

  // -------------------------------------------------------------- estados

  async transition(id: string, destino: ReportStatus, comentario: string | null, actor: AuthUser) {
    const doc = await this.documento(id);
    const origen = doc.estado;

    const transicion = REPORT_TRANSITIONS.find((t) => t.from === origen && t.to === destino);
    if (!transicion || !canTransition(origen, destino)) {
      throw new ConflictException(`Un informe «${origen}» no puede pasar a «${destino}».`);
    }

    // Cada transición tiene su propio permiso: enviar a revisión no es emitir.
    // El guard del controlador solo puede exigir uno fijo, así que el que
    // corresponde de verdad se comprueba aquí, contra la tabla de §14.2.
    if (!actor.permisos.includes(transicion.permission as Permission)) {
      throw new ForbiddenException(
        `Para pasar un informe de «${origen}» a «${destino}» hace falta el permiso ${transicion.permission}.`,
      );
    }

    if (transicion.requiresComment && !comentario?.trim()) {
      throw new BadRequestException(`Pasar a «${destino}» exige un comentario que lo justifique.`);
    }

    if (destino === 'emitido') {
      const { emitible, faltan } = await this.validate(id);
      if (!emitible) {
        // El detalle lleva la lista para que el frontend pinte los enlaces sin
        // tener que volver a preguntar.
        throw new BadRequestException({
          message: `Faltan ${faltan.length} datos obligatorios para emitir.`,
          faltan,
        });
      }

      // Se congela la plantilla (§11.1): a partir de aquí el informe se
      // renderiza igual para siempre, publique Calidad lo que publique.
      doc.templateSnapshot = await this.plantillaDe(doc);
      doc.fechaEmision = new Date();
    }

    doc.estado = destino;
    doc.historialEstados.push({
      de: origen,
      a: destino,
      usuarioId: new Types.ObjectId(actor.id),
      fecha: new Date(),
      comentario: comentario ?? null,
    });
    doc.updatedBy = new Types.ObjectId(actor.id);
    await doc.save();

    const emitido = this.conFigurasNumeradas(doc.toObject());

    if (destino === 'emitido') {
      // Se encola con las figuras ya numeradas: el PDF tiene que llevar los
      // mismos números que el técnico vio en la vista previa (RN-06).
      await this.documentos.encolarPdf(
        String(doc._id),
        emitido,
        doc.templateSnapshot as TemplateVersionDefinition,
      );
    }

    return emitido;
  }

  async remove(id: string, actor: AuthUser) {
    const doc = await this.documento(id);
    if (isImmutable(doc.estado)) {
      throw new ConflictException(
        `Un informe «${doc.estado}» no se borra: anúlalo para dejar constancia.`,
      );
    }

    doc.deletedAt = new Date();
    doc.updatedBy = new Types.ObjectId(actor.id);
    await doc.save();
    return { eliminado: true };
  }

  // ---------------------------------------------------------------- apoyo

  private async documento(id: string): Promise<ReportDocument> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('No existe ese informe.');
    const doc = await this.informes.findOne({ _id: id, deletedAt: null }).exec();
    if (!doc) throw new NotFoundException('No existe ese informe.');
    return doc;
  }

  /**
   * La plantilla con la que se edita o se renderiza.
   *
   * Un informe emitido usa su copia congelada; uno en borrador, la versión con
   * la que nació. Nunca «la vigente hoy»: eso cambiaría un documento firmado.
   */
  private async plantillaDe(doc: ReportDocument): Promise<TemplateVersionDefinition> {
    if (doc.templateSnapshot) return doc.templateSnapshot as TemplateVersionDefinition;
    return this.plantillas.findVersion(doc.templateCodigo, doc.templateVersion);
  }

  /** Contexto para las reglas de visibilidad de §11.3. */
  private contexto(doc: ReportDocument): Record<string, unknown> {
    return {
      equipo: doc.equipo ?? {},
      motor: doc.motor ?? {},
      intervencion: (doc.datos?.['intervencion'] as Record<string, unknown>) ?? {},
      cliente: doc.cliente ?? {},
      informe: {
        ...doc.datos,
        tercerizados: (doc.datos?.['tercerizados'] as unknown[]) ?? [],
        mediciones: doc.bloques.filter((b) => b.tipo === 'measurement_grid'),
      },
    };
  }

  /**
   * Añade el número de figura al leer, en vez de guardarlo.
   *
   * Es lo que hace que reordenar bloques renumere las figuras sin que nadie
   * escriba nada, en pantalla y en el PDF a la vez (RN-06).
   */
  private conFigurasNumeradas(informe: Record<string, unknown>) {
    const bloques = (informe['bloques'] ?? []) as BloqueInforme[];
    const numeros = figureNumbersById(
      bloques.map((b) => ({
        id: b.id,
        orden: b.orden,
        visible: b.visible,
        fotos: (b.fotos ?? []).map((f) => ({ id: f.id })),
      })),
    );

    return {
      ...informe,
      bloques: bloques.map((b) => ({
        ...b,
        fotos: (b.fotos ?? []).map((f) => ({ ...f, numeroFigura: numeros.get(f.id) ?? null })),
      })),
    };
  }

  private tieneContenido(bloque: BloqueInforme): boolean {
    if (bloque.texto?.trim()) return true;
    if ((bloque.fotos ?? []).length > 0) return true;
    if (Array.isArray(bloque.datos)) return bloque.datos.length > 0;
    if (bloque.datos && typeof bloque.datos === 'object') {
      return Object.keys(bloque.datos).length > 0;
    }
    return Boolean(bloque.datos);
  }

  private exigirEditable(doc: ReportDocument): void {
    if (isImmutable(doc.estado)) {
      // RN-02. Un informe emitido es un documento controlado: corregirlo es
      // emitir otro, no reescribir el que ya está firmado y entregado.
      throw new ForbiddenException(
        `El informe está «${doc.estado}» y ya no se puede editar. Para corregirlo hay que emitir una versión nueva.`,
      );
    }
  }

  private limpiar(data: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(data).filter(([k]) => !CAMPOS_PROTEGIDOS.has(k)));
  }

  /**
   * Valida que el identificador tenga forma de tal y lo devuelve **en crudo**.
   *
   * Construir aquí el `ObjectId` no funciona: la conversión correcta depende del
   * tipo declarado en el schema, y hacerla a mano produce un filtro que no
   * casa con lo guardado. Se deja que la haga Mongoose.
   */
  private comoId(valor: string, campo: string): string {
    if (!Types.ObjectId.isValid(valor)) {
      throw new BadRequestException(`El filtro «${campo}» no es un identificador válido.`);
    }
    return valor;
  }

  private validarNumero(valor: unknown): string {
    const { valido, normalizado, motivo } = checkReportNumber(String(valor ?? ''));
    if (!valido) throw new BadRequestException(motivo);
    return normalizado;
  }

  private traducirError(error: unknown, numero: string): Error {
    const e = error as { code?: number };
    if (e?.code === 11000) {
      return new ConflictException(`Ya existe un informe con el número «${numero}».`);
    }
    return error as Error;
  }
}

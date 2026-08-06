import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  findMissingBlocks,
  resolveTemplate,
  validateTemplate,
  type MissingBlock,
  type ResolvedSection,
  type TemplateSectionDefinition,
  type TemplateVersionDefinition,
  type VisibilityContext,
} from '@dps/shared';
import {
  ReportTemplate,
  TemplateVersion,
  type ReportTemplateDocument,
  type TemplateVersionDocument,
} from './schemas/template.schema';
import type { AuthUser } from '../common/decorators/current-user.decorator';

@Injectable()
export class TemplatesService {
  constructor(
    @InjectModel(ReportTemplate.name)
    private readonly templates: Model<ReportTemplateDocument>,
    @InjectModel(TemplateVersion.name)
    private readonly versions: Model<TemplateVersionDocument>,
  ) {}

  async listTemplates() {
    const items = await this.templates.find({ deletedAt: null, activo: true }).lean().exec();
    return { total: items.length, items };
  }

  async listVersions(codigo: string) {
    const items = await this.versions
      .find({ codigo: codigo.toUpperCase() })
      .select('codigo version nombre estado fechaPublicacion')
      .sort({ version: -1 })
      .lean()
      .exec();
    return { total: items.length, items };
  }

  /**
   * La versión con la que se crea un informe nuevo.
   *
   * Si hay varias publicadas gana la última: publicar v02 no retira v01 —los
   * informes en curso siguen con la suya— pero los nuevos ya nacen con v02.
   */
  async vigente(codigo: string): Promise<TemplateVersionDefinition> {
    const doc = await this.versions
      .findOne({ codigo: codigo.toUpperCase(), estado: 'publicada' })
      .sort({ fechaPublicacion: -1 })
      .lean()
      .exec();

    if (!doc) {
      throw new NotFoundException(`No hay ninguna versión publicada de «${codigo}».`);
    }
    return this.aDefinicion(doc);
  }

  async findVersion(codigo: string, version: string): Promise<TemplateVersionDefinition> {
    const doc = await this.versions
      .findOne({ codigo: codigo.toUpperCase(), version })
      .lean()
      .exec();

    if (!doc) throw new NotFoundException(`No existe la versión «${version}» de «${codigo}».`);
    return this.aDefinicion(doc);
  }

  /**
   * Qué secciones y bloques le tocan a un informe concreto (§11.3).
   *
   * Se expone como endpoint para que el wizard no tenga que reimplementar la
   * resolución: la misma función de `libs/shared` decide en los dos lados, pero
   * el servidor es quien manda si alguna vez discrepan.
   */
  async resolve(codigo: string, contexto: VisibilityContext): Promise<ResolvedSection[]> {
    return resolveTemplate(await this.vigente(codigo), contexto);
  }

  /** Los obligatorios que faltan, con el paso al que llevan (UX-07). */
  async missing(
    definicion: TemplateVersionDefinition,
    contexto: VisibilityContext,
    conDatos: ReadonlySet<string>,
  ): Promise<MissingBlock[]> {
    return findMissingBlocks(definicion, contexto, conDatos);
  }

  /** Alta de una versión en borrador. Calidad puede dejarla a medias. */
  async createVersion(
    codigo: string,
    datos: { version: string; nombre?: string; secciones?: TemplateSectionDefinition[] },
    actor: AuthUser,
  ) {
    const clave = codigo.toUpperCase();
    const plantilla = await this.templates.findOne({ codigo: clave, deletedAt: null }).exec();
    if (!plantilla) throw new NotFoundException(`No existe la plantilla «${codigo}».`);

    if (!datos.version?.trim()) {
      throw new BadRequestException('Hay que indicar el número de versión.');
    }

    const yaExiste = await this.versions
      .countDocuments({ codigo: clave, version: datos.version })
      .exec();
    if (yaExiste) {
      throw new ConflictException(`Ya existe la versión «${datos.version}» de «${codigo}».`);
    }

    const doc = await this.versions.create({
      templateId: plantilla._id,
      codigo: clave,
      version: datos.version,
      nombre: datos.nombre ?? plantilla.nombre,
      estado: 'borrador',
      secciones: datos.secciones ?? [],
      createdBy: new Types.ObjectId(actor.id),
      updatedBy: new Types.ObjectId(actor.id),
    });

    return doc.toObject();
  }

  async updateVersion(
    codigo: string,
    version: string,
    secciones: TemplateSectionDefinition[],
    actor: AuthUser,
  ) {
    const doc = await this.versions.findOne({ codigo: codigo.toUpperCase(), version }).exec();
    if (!doc) throw new NotFoundException(`No existe la versión «${version}» de «${codigo}».`);

    // Regla de inmutabilidad de §11.1. Una versión publicada puede estar
    // referenciada por informes emitidos; cambiarla alteraría documentos ya
    // firmados. Para corregir algo se publica una versión nueva.
    if (doc.estado === 'publicada') {
      throw new ConflictException(
        `La versión «${version}» ya está publicada y no se puede modificar: crea una versión nueva.`,
      );
    }

    doc.secciones = secciones;
    doc.updatedBy = new Types.ObjectId(actor.id);
    await doc.save();
    return doc.toObject();
  }

  /**
   * Publicar es el único momento en que se exige coherencia.
   *
   * Es también el único momento en que se detectan las reglas de visibilidad mal
   * escritas: en ejecución se ignoran y la sección se muestra, para no dejar un
   * informe incompleto sin que nadie lo note.
   */
  async publish(codigo: string, version: string, actor: AuthUser) {
    const doc = await this.versions.findOne({ codigo: codigo.toUpperCase(), version }).exec();
    if (!doc) throw new NotFoundException(`No existe la versión «${version}» de «${codigo}».`);

    if (doc.estado === 'publicada') {
      throw new ConflictException(`La versión «${version}» ya estaba publicada.`);
    }

    const errores = validateTemplate(this.aDefinicion(doc.toObject()));
    if (errores.length) {
      throw new BadRequestException(
        `La plantilla no se puede publicar:\n· ${errores.join('\n· ')}`,
      );
    }

    doc.estado = 'publicada';
    doc.fechaPublicacion = new Date();
    doc.publicadaPor = new Types.ObjectId(actor.id);
    doc.updatedBy = new Types.ObjectId(actor.id);
    await doc.save();

    return doc.toObject();
  }

  private aDefinicion(doc: {
    codigo: string;
    version: string;
    nombre: string;
    estado: string;
    secciones: TemplateSectionDefinition[];
  }): TemplateVersionDefinition {
    return {
      codigo: doc.codigo,
      version: doc.version,
      nombre: doc.nombre,
      estado: doc.estado as TemplateVersionDefinition['estado'],
      secciones: doc.secciones ?? [],
    };
  }
}

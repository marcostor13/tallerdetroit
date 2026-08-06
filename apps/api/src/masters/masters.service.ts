import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types, type FilterQuery, type Model } from 'mongoose';

/** Documento genérico: este servicio atiende a los 35 catálogos por igual. */
type MasterDocument = Record<string, unknown>;
import { fuzzySearch } from '@dps/shared';
import { type MasterDefinition, findMaster } from './master-registry';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';

export interface ListOptions {
  readonly q?: string;
  readonly limit?: number;
  readonly incluirInactivos?: boolean;
  /** Filtros de la cascada: `{ clienteId: '…' }`. */
  readonly filtros?: Record<string, string>;
}

/** Cuántos registros se traen de la base antes de ordenarlos por parecido. */
const CANDIDATOS_PARA_BUSQUEDA = 400;

/** Campos que ninguna actualización puede tocar. */
const CAMPOS_PROTEGIDOS = new Set(['_id', 'createdBy', 'createdAt', 'deletedAt']);

@Injectable()
export class MastersService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly auditoria: AuditService,
  ) {}

  definition(key: string): MasterDefinition {
    const def = findMaster(key);
    if (!def) throw new NotFoundException(`No existe el maestro «${key}».`);
    return def;
  }

  /**
   * Modelo del maestro. Se tipa como documento genérico a propósito: este
   * servicio sirve a los 35 catálogos y no puede conocer la forma de cada uno.
   * La validación real la hace el schema de Mongoose.
   */
  private model(def: MasterDefinition): Model<MasterDocument> {
    return (this.connection.models[def.model] ??
      this.connection.model(def.model, def.schema)) as unknown as Model<MasterDocument>;
  }

  /**
   * Listado con búsqueda tolerante a errores (§13.3.2).
   *
   * El índice de texto de Mongo no encuentra `KOMATSU` buscando `KOMATZU`, así
   * que se traen los candidatos ya filtrados por la cascada y se ordenan por
   * parecido en memoria. Con catálogos de este tamaño —cientos de registros, no
   * millones— es más simple y más exacto que montar Atlas Search, y funciona
   * igual contra la caché local del modo offline.
   */
  async list(key: string, options: ListOptions = {}) {
    const def = this.definition(key);
    const model = this.model(def);

    // `incluirInactivos` es la vista de administración: muestra también los
    // desactivados y los dados de baja, que es donde se los recupera o fusiona.
    const filtro: FilterQuery<unknown> = {};
    if (!options.incluirInactivos) {
      filtro['deletedAt'] = null;
      filtro['activo'] = true;
    }

    for (const campo of def.filterFields ?? []) {
      const valor = options.filtros?.[campo];
      if (!valor) continue;

      if (campo.endsWith('Id') && !Types.ObjectId.isValid(valor)) {
        throw new BadRequestException(`El filtro «${campo}» no es un identificador válido.`);
      }

      // Se pasa el valor en crudo y lo convierte Mongoose según el schema. Es
      // más fiable que construir el ObjectId aquí: este servicio atiende a los
      // 35 catálogos y no conoce el tipo de cada campo.
      filtro[campo] = valor;
    }

    const limit = Math.min(options.limit ?? 50, 200);
    const candidatos = await model
      .find(filtro)
      .limit(options.q ? CANDIDATOS_PARA_BUSQUEDA : limit)
      .sort({ [def.displayField]: 1 })
      .lean()
      .exec();

    if (!options.q?.trim()) {
      return { total: candidatos.length, items: candidatos };
    }

    const encontrados = fuzzySearch(
      options.q,
      candidatos as Record<string, unknown>[],
      (item) => def.searchFields.map((f) => item[f] as string | null | undefined),
      { limit },
    );

    return {
      total: encontrados.length,
      items: encontrados.map((m) => ({ ...m.item, _score: Number(m.score.toFixed(3)) })),
    };
  }

  async findById(key: string, id: string) {
    const def = this.definition(key);
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException(`No existe ese ${def.label}.`);

    const doc = await this.model(def).findOne({ _id: id, deletedAt: null }).lean().exec();
    if (!doc) throw new NotFoundException(`No existe ese ${def.label}.`);
    return doc;
  }

  /**
   * Alta. Con `inline` solo se admiten los campos mínimos y el registro queda
   * marcado `pendienteValidacion` (§13.3.1).
   *
   * Este es el requisito del que depende que los maestros se usen: si el técnico
   * no encuentra `VQT-131` y no puede crearlo sin salir del informe, vuelve al
   * texto libre y el catálogo deja de servir.
   */
  async create(key: string, data: Record<string, unknown>, actor: AuthUser, inline = false) {
    const def = this.definition(key);

    if (inline) {
      if (!def.inlineFields?.length) {
        throw new BadRequestException(
          `El maestro «${def.label}» no admite creación rápida: dalo de alta desde administración.`,
        );
      }
      const permitidos = new Set(def.inlineFields);
      const sobrantes = Object.keys(data).filter((k) => !permitidos.has(k));
      if (sobrantes.length) {
        throw new BadRequestException(
          `En la creación rápida de ${def.label} solo se admite: ${def.inlineFields.join(', ')}.`,
        );
      }
    }

    try {
      const doc = await this.model(def).create({
        ...data,
        pendienteValidacion: inline,
        createdBy: new Types.ObjectId(actor.id),
        updatedBy: new Types.ObjectId(actor.id),
      });

      await this.auditoria.registrar(actor, {
        entidad: `masters.${key}`,
        entidadId: String(doc._id),
        accion: inline ? 'crear-inline' : 'crear',
        etiqueta: this.etiquetaDe(doc.toObject() as Record<string, unknown>),
        despues: data,
      });

      return doc.toObject();
    } catch (error: unknown) {
      throw this.traducirError(error, def);
    }
  }

  async update(key: string, id: string, data: Record<string, unknown>, actor: AuthUser) {
    const def = this.definition(key);
    await this.findById(key, id);

    // Nunca se reescriben desde fuera: la autoría y la baja lógica las lleva el
    // servicio, no el cliente.
    const resto = Object.fromEntries(
      Object.entries(data).filter(([campo]) => !CAMPOS_PROTEGIDOS.has(campo)),
    );

    try {
      const doc = await this.model(def)
        .findOneAndUpdate(
          { _id: id, deletedAt: null },
          { $set: { ...resto, updatedBy: new Types.ObjectId(actor.id) } },
          { new: true, runValidators: true },
        )
        .lean()
        .exec();

      await this.auditoria.registrar(actor, {
        entidad: `masters.${key}`,
        entidadId: id,
        accion: 'actualizar',
        etiqueta: this.etiquetaDe(doc as Record<string, unknown> | null),
        despues: resto,
      });

      return doc;
    } catch (error: unknown) {
      throw this.traducirError(error, def);
    }
  }

  /**
   * Soft delete. Nada se borra de verdad: los informes emitidos guardan el
   * identificador y deben poder seguir resolviéndolo (§13.3.5).
   */
  async remove(key: string, id: string, actor: AuthUser) {
    const def = this.definition(key);
    await this.findById(key, id);

    await this.model(def).updateOne(
      { _id: id },
      { $set: { deletedAt: new Date(), activo: false, updatedBy: new Types.ObjectId(actor.id) } },
    );

    await this.auditoria.registrar(actor, {
      entidad: `masters.${key}`,
      entidadId: id,
      accion: 'eliminar',
      etiqueta: def.label,
    });

    return { eliminado: true, label: def.label };
  }

  /**
   * Con qué nombre aparece el registro en el log.
   *
   * Un identificador de Mongo no le dice nada a quien consulta la auditoría:
   * lo que busca es «KOMATSU» o «SPCC. TOQUEPALA».
   */
  private etiquetaDe(doc: Record<string, unknown> | null): string | null {
    if (!doc) return null;
    for (const campo of ['nombre', 'denominacion', 'razonSocial', 'nombreCorto', 'clave', 'codigo']) {
      const valor = doc[campo];
      if (typeof valor === 'string' && valor.trim()) return valor;
    }
    return null;
  }

  /** Traduce el error de clave duplicada a algo que el usuario entienda. */
  private traducirError(error: unknown, def: MasterDefinition): Error {
    const e = error as { code?: number; keyValue?: Record<string, unknown> };
    if (e?.code === 11000) {
      const campos = Object.entries(e.keyValue ?? {})
        .map(([k, v]) => `${k} «${String(v)}»`)
        .join(', ');
      return new ConflictException(`Ya existe un ${def.label} con ${campos || 'esos datos'}.`);
    }
    return error as Error;
  }
}

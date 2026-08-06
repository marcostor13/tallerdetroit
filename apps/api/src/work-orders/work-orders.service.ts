import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, type FilterQuery } from 'mongoose';
import { checkWorkOrderNumber, suggestNextNumber } from '@dps/shared';
import {
  WorkOrder,
  type WorkOrderDocument,
  type WorkOrderState,
} from './schemas/work-order.schema';
import type { AuthUser } from '../common/decorators/current-user.decorator';

export interface ListWorkOrdersOptions {
  readonly q?: string;
  readonly estado?: WorkOrderState;
  readonly clienteId?: string;
  readonly equipoId?: string;
  readonly limit?: number;
}

@Injectable()
export class WorkOrdersService {
  constructor(@InjectModel(WorkOrder.name) private readonly ordenes: Model<WorkOrderDocument>) {}

  async list(options: ListWorkOrdersOptions = {}) {
    const filtro: FilterQuery<WorkOrderDocument> = { deletedAt: null };

    if (options.estado) filtro.estado = options.estado;
    for (const campo of ['clienteId', 'equipoId'] as const) {
      const valor = options[campo];
      if (!valor) continue;
      if (!Types.ObjectId.isValid(valor)) {
        throw new BadRequestException(`El filtro «${campo}» no es un identificador válido.`);
      }
      filtro[campo] = valor;
    }

    if (options.q?.trim()) {
      // Se busca sobre el número ya normalizado: quien teclea «lim-tal-898»
      // espera encontrar `LIM-TAL-000898`.
      const termino = options.q.trim().toUpperCase().replace(/\s+/g, '');
      filtro.numero = { $regex: termino.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') };
    }

    const items = await this.ordenes
      .find(filtro)
      .sort({ fechaApertura: -1, createdAt: -1 })
      .limit(Math.min(options.limit ?? 50, 200))
      .lean()
      .exec();

    return { total: items.length, items };
  }

  async findById(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('No existe esa orden de trabajo.');
    const doc = await this.ordenes.findOne({ _id: id, deletedAt: null }).lean().exec();
    if (!doc) throw new NotFoundException('No existe esa orden de trabajo.');
    return doc;
  }

  /** Búsqueda por número, que es como la conoce el técnico. */
  async findByNumero(numero: string) {
    const { normalizado } = checkWorkOrderNumber(numero);
    const doc = await this.ordenes.findOne({ numero: normalizado, deletedAt: null }).lean().exec();
    if (!doc) throw new NotFoundException(`No existe la orden de trabajo «${numero}».`);
    return doc;
  }

  async create(data: Record<string, unknown>, actor: AuthUser) {
    const numero = this.validarNumero(data['numero']);

    if (!data['clienteId']) {
      throw new BadRequestException('Hay que indicar el cliente de la orden de trabajo.');
    }

    try {
      const doc = await this.ordenes.create({
        ...data,
        numero,
        fechaApertura: data['fechaApertura'] ?? new Date(),
        createdBy: new Types.ObjectId(actor.id),
        updatedBy: new Types.ObjectId(actor.id),
      });
      return doc.toObject();
    } catch (error: unknown) {
      throw this.traducirError(error, numero);
    }
  }

  async update(id: string, data: Record<string, unknown>, actor: AuthUser) {
    await this.findById(id);

    const cambios: Record<string, unknown> = { ...data };
    delete cambios['_id'];
    delete cambios['createdBy'];
    delete cambios['createdAt'];
    delete cambios['deletedAt'];

    if (cambios['numero'] !== undefined) {
      cambios['numero'] = this.validarNumero(cambios['numero']);
    }

    // Cerrar deja constancia de cuándo: la fecha de cierre no se teclea a mano
    // porque es el dato con el que se mide el tiempo de taller.
    if (cambios['estado'] === 'cerrada' && !cambios['fechaCierre']) {
      cambios['fechaCierre'] = new Date();
    }

    try {
      return await this.ordenes
        .findOneAndUpdate(
          { _id: id, deletedAt: null },
          { $set: { ...cambios, updatedBy: new Types.ObjectId(actor.id) } },
          { new: true, runValidators: true },
        )
        .lean()
        .exec();
    } catch (error: unknown) {
      throw this.traducirError(error, String(cambios['numero'] ?? ''));
    }
  }

  async remove(id: string, actor: AuthUser) {
    await this.findById(id);
    await this.ordenes.updateOne(
      { _id: id },
      { $set: { deletedAt: new Date(), activo: false, updatedBy: new Types.ObjectId(actor.id) } },
    );
    return { eliminado: true };
  }

  /**
   * Propone el siguiente número a partir del último dado de alta.
   *
   * Es una ayuda para teclear menos, no un generador: mientras D3 siga abierta,
   * el técnico puede cambiar lo que se le proponga. Por eso el campo del
   * formulario queda editable y esto no reserva nada.
   */
  async sugerirNumero(
    prefijo?: string,
  ): Promise<{ sugerencia: string | null; ultimo: string | null }> {
    const filtro: FilterQuery<WorkOrderDocument> = { deletedAt: null };
    if (prefijo?.trim()) {
      const limpio = prefijo
        .trim()
        .toUpperCase()
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filtro.numero = { $regex: `^${limpio}` };
    }

    const ultima = await this.ordenes.findOne(filtro).sort({ numero: -1 }).lean().exec();
    if (!ultima) return { sugerencia: null, ultimo: null };

    return { sugerencia: suggestNextNumber(ultima.numero), ultimo: ultima.numero };
  }

  private validarNumero(valor: unknown): string {
    const { valido, normalizado, motivo } = checkWorkOrderNumber(String(valor ?? ''));
    if (!valido) throw new BadRequestException(motivo);
    return normalizado;
  }

  private traducirError(error: unknown, numero: string): Error {
    const e = error as { code?: number };
    if (e?.code === 11000) {
      // RN-01 adaptada a D3: sin generador automático, la unicidad es lo único
      // que impide dos órdenes indistinguibles.
      return new ConflictException(`Ya existe una orden de trabajo con el número «${numero}».`);
    }
    return error as Error;
  }
}

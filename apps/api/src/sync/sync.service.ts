import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ordenarParaEnvio, type ResultadoDeOperacion, type TipoDeOperacion } from '@dps/shared';
import { AppliedOp, type AppliedOpDocument } from './schemas/applied-op.schema';
import { ReportsService } from '../reports/reports.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';

/** Una operación tal como llega del dispositivo. */
export interface OperacionEntrante {
  readonly clientOpId: string;
  readonly tipo: TipoDeOperacion;
  readonly informeId: string;
  readonly bloqueId?: string | null;
  readonly datos?: Record<string, unknown>;
  readonly capturadaEn?: string;
}

/**
 * Sincronización de lo capturado sin red (E4.4).
 *
 * Aplica las operaciones **una a una y en orden**, no en bloque. Una que falle
 * no puede llevarse por delante las demás: si la foto 14 de veinte da error, las
 * otras diecinueve tienen que quedar guardadas y solo esa vuelve a la cola del
 * dispositivo.
 *
 * Y aplica cada una con el servicio de dominio de siempre, no escribiendo en
 * Mongo por su cuenta. Una vía paralela de escritura se saltaría la validación,
 * la auditoría y las reglas de negocio, y lo capturado offline acabaría siendo
 * de peor calidad que lo capturado con red — que es justo al revés de lo que
 * hace falta.
 */
@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    @InjectModel(AppliedOp.name) private readonly aplicadas: Model<AppliedOpDocument>,
    private readonly informes: ReportsService,
  ) {}

  async push(
    operaciones: readonly OperacionEntrante[],
    actor: AuthUser,
  ): Promise<{ resultados: ResultadoDeOperacion[] }> {
    const resultados: ResultadoDeOperacion[] = [];
    /** Id local → id definitivo, dentro de este mismo envío. */
    const equivalencias = new Map<string, string>();

    for (const operacion of ordenarParaEnvio(
      operaciones.map((o) => ({
        ...o,
        datos: o.datos ?? {},
        capturadaEn: o.capturadaEn ?? new Date().toISOString(),
        estado: 'pendiente' as const,
        intentos: 0,
      })),
    )) {
      resultados.push(await this.aplicarUna(operacion, equivalencias, actor));
    }

    return { resultados };
  }

  // ---------------------------------------------------------------- privado

  private async aplicarUna(
    operacion: OperacionEntrante,
    equivalencias: Map<string, string>,
    actor: AuthUser,
  ): Promise<ResultadoDeOperacion> {
    const { clientOpId } = operacion;

    if (!clientOpId) {
      return { clientOpId: '', estado: 'error', detalle: 'Falta el clientOpId.' };
    }

    // Idempotencia: si ya se aplicó, se contesta con lo mismo que la primera
    // vez. Devolver «ya estaba» a secas perdería el id que el cliente necesita.
    const yaEstaba = await this.aplicadas
      .findOne({ clientOpId, actorId: new Types.ObjectId(actor.id) })
      .lean()
      .exec();

    if (yaEstaba) {
      return { clientOpId, estado: 'repetida', informeId: yaEstaba.informeId };
    }

    // El id local se resuelve contra lo creado en este mismo envío: la foto
    // llega en el mismo lote que la creación del informe al que pertenece.
    const informeId = equivalencias.get(operacion.informeId) ?? operacion.informeId;

    try {
      const definitivo = await this.ejecutar({ ...operacion, informeId }, actor);

      if (operacion.tipo === 'crear-informe' && definitivo) {
        equivalencias.set(operacion.informeId, definitivo);
      }

      await this.anotar(clientOpId, operacion.tipo, definitivo ?? informeId, actor);

      return { clientOpId, estado: 'aplicada', informeId: definitivo ?? informeId };
    } catch (e: unknown) {
      const detalle = this.mensaje(e);

      // Un 409 es un conflicto de verdad —alguien tocó lo mismo— y reintentarlo
      // no lo arregla; el resto sí puede ser transitorio y vuelve a la cola.
      const estado = this.esConflicto(e) ? 'conflicto' : 'error';
      this.logger.warn(`Operación ${clientOpId} (${operacion.tipo}): ${detalle}`);

      return { clientOpId, estado, detalle };
    }
  }

  /** Devuelve el id definitivo del informe cuando la operación lo crea. */
  private async ejecutar(operacion: OperacionEntrante, actor: AuthUser): Promise<string | null> {
    const datos = operacion.datos ?? {};

    switch (operacion.tipo) {
      case 'crear-informe': {
        const creado = (await this.informes.create(datos, actor)) as { _id: unknown };
        return String(creado._id);
      }

      case 'editar-informe':
        await this.informes.patch(operacion.informeId, datos, actor);
        return null;

      case 'agregar-bloque':
        await this.informes.addBlock(operacion.informeId, datos, actor);
        return null;

      case 'editar-bloque':
      case 'agregar-foto':
        // Añadir una foto es editar el bloque que la contiene: el servidor
        // recalcula la numeración de figuras desde el orden (RN-06).
        await this.informes.updateBlock(operacion.informeId, operacion.bloqueId ?? '', datos, actor);
        return null;

      case 'quitar-bloque':
        await this.informes.removeBlock(operacion.informeId, operacion.bloqueId ?? '', actor);
        return null;

      case 'guardar-medicion':
        await this.informes.guardarMedicion(
          operacion.informeId,
          operacion.bloqueId ?? '',
          datos as never,
          actor,
        );
        return null;

      case 'guardar-checklist':
        await this.informes.guardarChecklist(
          operacion.informeId,
          operacion.bloqueId ?? '',
          datos as never,
          actor,
        );
        return null;

      case 'comentar':
        await this.informes.comentar(operacion.informeId, datos as never, actor);
        return null;

      default:
        throw new Error(`Tipo de operación desconocido: ${String(operacion.tipo)}`);
    }
  }

  /**
   * Anota que la operación ya se aplicó.
   *
   * Si esto falla, la operación **ya ocurrió**: lo que no se puede es
   * deshacerla. Se registra el fallo y se sigue; el precio es que un reenvío
   * muy improbable duplique algo, y es menor que perder el trabajo.
   */
  private async anotar(
    clientOpId: string,
    tipo: string,
    informeId: string | null,
    actor: AuthUser,
  ): Promise<void> {
    try {
      await this.aplicadas.create({
        clientOpId,
        actorId: new Types.ObjectId(actor.id),
        tipo,
        informeId,
      });
    } catch (e: unknown) {
      this.logger.error(`No se pudo anotar la operación ${clientOpId}: ${String(e)}`);
    }
  }

  private esConflicto(error: unknown): boolean {
    const status = (error as { status?: number; getStatus?: () => number }).getStatus?.();
    return status === 409;
  }

  private mensaje(error: unknown): string {
    const respuesta = (error as { getResponse?: () => unknown }).getResponse?.();
    if (typeof respuesta === 'string') return respuesta;
    if (respuesta && typeof respuesta === 'object') {
      const detalle = (respuesta as { message?: unknown }).message;
      if (typeof detalle === 'string') return detalle;
    }
    return (error as Error).message ?? 'Error desconocido.';
  }
}

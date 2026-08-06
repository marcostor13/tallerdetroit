import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import {
  evaluarCalibracion,
  explicarCalibracion,
  type CalibracionEvaluada,
  type InstrumentoUsado,
} from '@dps/shared';
import type { ReportDocument } from './schemas/report.schema';

/**
 * Control de calibración de los instrumentos del informe (RN-04, E3.10).
 *
 * Los instrumentos se declaran en la tabla `instrumentos` del paso 4, y de cada
 * fila lo que importa es el `instrumentId`: el resto —código, marca, serie— es
 * una copia para el documento, y si la regla se juzgara sobre esa copia
 * bastaría con teclear otra cosa para saltársela.
 *
 * La comparación es contra la **fecha del servicio**, no contra hoy. Un informe
 * que se redacta en agosto sobre un trabajo de junio se juzga por si el
 * instrumento estaba calibrado en junio; lo contrario invalidaría trabajos
 * correctos solo por tardar en escribirlos.
 */
@Injectable()
export class CalibrationService {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  /**
   * Instrumentos del informe cuya calibración no estaba vigente.
   *
   * Devuelve la evaluación completa, no un booleano: el aviso tiene que decir
   * **cuál** y cuánto hace que venció. Un «calibración vencida» a secas obliga
   * al técnico a ir al maestro a averiguar cuál de los seis instrumentos es.
   */
  async vencidosDe(doc: ReportDocument): Promise<readonly CalibracionEvaluada[]> {
    const usados = await this.instrumentosDe(doc);
    if (!usados.length) return [];

    const fecha = this.fechaDelServicio(doc);
    return usados.map((i) => evaluarCalibracion(i, fecha)).filter((e) => e.estado === 'vencida');
  }

  /** Cómo se explica cada uno en la lista de lo que falta para emitir. */
  explicar(evaluada: CalibracionEvaluada): string {
    return explicarCalibracion(evaluada);
  }

  // ---------------------------------------------------------------- privado

  /**
   * Cuándo se hizo el trabajo.
   *
   * Por orden: la fecha declarada de la intervención, la del primer bloque de
   * trabajo, y por último hoy. La fecha de emisión no sirve —es posterior por
   * definición— y usarla haría que un informe tardío suspendiera instrumentos
   * que estaban en regla cuando se midió.
   */
  private fechaDelServicio(doc: ReportDocument): Date {
    const intervencion = (doc.datos?.['intervencion'] ?? {}) as Record<string, unknown>;
    const declarada = intervencion['fecha'] ?? intervencion['fechaInicio'];
    if (declarada) {
      const fecha = new Date(String(declarada));
      if (!isNaN(fecha.getTime())) return fecha;
    }

    const conFecha = doc.bloques.find((b) => b.fechaTrabajo);
    return conFecha?.fechaTrabajo ? new Date(conFecha.fechaTrabajo) : new Date();
  }

  /**
   * Resuelve los instrumentos declarados contra el maestro.
   *
   * Las filas sin `instrumentId` se ignoran: son texto libre que alguien
   * escribió antes de que el maestro existiera, y no hay contra qué juzgarlas.
   * Quedan visibles en el documento igual.
   */
  private async instrumentosDe(doc: ReportDocument): Promise<InstrumentoUsado[]> {
    const filas = (doc.datos?.['instrumentos'] ?? []) as Record<string, unknown>[];
    if (!Array.isArray(filas) || !filas.length) return [];

    const ids = filas
      .map((f) => f['instrumentId'])
      .filter((id): id is string => !!id && Types.ObjectId.isValid(String(id)))
      .map((id) => new Types.ObjectId(String(id)));

    if (!ids.length) return [];

    const modelo = this.connection.models['Instrument'];
    if (!modelo) return [];

    const documentos = await modelo
      .find({ _id: { $in: ids }, deletedAt: null })
      .lean()
      .exec();

    return (documentos as unknown as Record<string, unknown>[]).map((i) => ({
      id: String(i['_id']),
      codigo: String(i['codigo'] ?? ''),
      denominacion: i['denominacion'] ? String(i['denominacion']) : null,
      serie: i['serie'] ? String(i['serie']) : null,
      calibracionVence: (i['calibracionVence'] as Date | null) ?? null,
      certificado: i['certificado'] ? String(i['certificado']) : null,
    }));
  }
}

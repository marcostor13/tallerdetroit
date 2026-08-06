import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { absoluteValue, type AppliedSpec } from '@dps/shared';
import { MeasurementFact, type MeasurementFactDocument } from './schemas/measurement-fact.schema';
import type { ReportDocument } from './schemas/report.schema';

/** Serie histórica de un parámetro para un motor. */
export interface PuntoDeSerie {
  readonly fechaEmision: Date;
  readonly numeroInforme: string;
  readonly horasMotor: number | null;
  readonly valor: number;
  readonly estado: string | null;
  readonly fila: string;
  readonly columna: string;
}

/**
 * Escritura de la colección analítica al emitir (E2.8, §16.3).
 *
 * Es el activo que hoy se pierde: los mismos parámetros se miden intervención
 * tras intervención, pero los valores quedan enterrados dentro de un Word.
 * Nadie puede responder «cómo ha evolucionado el juego axial del cigüeñal del
 * 5282011236» sin abrir a mano todos sus informes.
 *
 * Se escribe **solo al emitir**. Un borrador cambia mientras se redacta, y sus
 * valores no son un hecho todavía.
 */
@Injectable()
export class MeasurementFactsService {
  private readonly logger = new Logger(MeasurementFactsService.name);

  constructor(
    @InjectModel(MeasurementFact.name)
    private readonly hechos: Model<MeasurementFactDocument>,
  ) {}

  /**
   * Vuelca las mediciones del informe.
   *
   * Es idempotente: reemitir reemplaza los hechos de ese informe en vez de
   * duplicarlos. Sin eso, una segunda emisión doblaría cada punto de la curva.
   */
  async registrar(doc: ReportDocument): Promise<number> {
    const motor = (doc.motor ?? {}) as Record<string, unknown>;
    const equipo = (doc.equipo ?? {}) as Record<string, unknown>;

    const comun = {
      reportId: doc._id as Types.ObjectId,
      numeroInforme: doc.numeroInforme,
      fechaEmision: doc.fechaEmision ?? new Date(),
      motorId: this.comoId(motor['id']),
      motorSerie: this.comoTexto(motor['serie']),
      modeloMotor: this.comoTexto(motor['modelo']),
      equipoId: this.comoId(equipo['id']),
      equipoCodigo: this.comoTexto(equipo['codigo']),
      clienteId: this.comoId(doc.cliente?.id),
      horasMotor: Number(doc.datos?.['horasTotales']) || null,
    };

    const filas: Record<string, unknown>[] = [];

    for (const bloque of doc.bloques ?? []) {
      for (const grilla of (bloque.mediciones ?? []) as unknown as {
        plantilla?: string;
        unidad?: string;
        valores?: {
          fila: string;
          columna: string;
          valor: number | null;
          estado?: string | null;
          calculado?: boolean;
        }[];
        especificacion?: AppliedSpec | null;
      }[]) {
        const spec = grilla.especificacion ?? null;

        for (const celda of grilla.valores ?? []) {
          // Las calculadas no son mediciones: son una consecuencia de otras, y
          // meterlas en la serie contaría dos veces el mismo desgaste.
          if (celda.valor === null || celda.calculado) continue;

          filas.push({
            ...comun,
            parametro: grilla.plantilla ?? 'desconocido',
            fila: celda.fila,
            columna: celda.columna,
            // El absoluto, no el tecleado: los muñones se anotan como
            // desviación y los encajes como medida directa (D2), y una curva
            // que mezclara ambas formas no significaría nada.
            valor: spec ? absoluteValue(celda.valor, spec) : celda.valor,
            unidad: grilla.unidad ?? spec?.unidad ?? 'mm',
            nominal: spec?.nominal ?? null,
            tolInf: spec?.tolInf ?? null,
            tolSup: spec?.tolSup ?? null,
            estado: celda.estado ?? null,
            specProvisional: spec?.provisional ?? false,
          });
        }
      }
    }

    if (!filas.length) return 0;

    try {
      // Se borran los de este informe y se reescriben: reemitir no duplica.
      await this.hechos.deleteMany({ reportId: doc._id });
      await this.hechos.insertMany(filas, { ordered: false });
      return filas.length;
    } catch (error: unknown) {
      // Que falle la analítica no puede deshacer una emisión. El informe ya
      // está congelado y entregado; los hechos se pueden reconstruir después.
      this.logger.error(
        `No se pudieron registrar las mediciones de ${doc.numeroInforme}: ${(error as Error).message}`,
      );
      return 0;
    }
  }

  /**
   * Evolución de un parámetro para un motor, por su número de serie.
   *
   * Es la consulta que justifica toda la colección: un solo índice y
   * milisegundos, en vez de abrir todos los informes de ese motor.
   */
  async serieHistorica(
    motorSerie: string,
    parametro: string,
    opciones: { fila?: string; columna?: string } = {},
  ): Promise<PuntoDeSerie[]> {
    const filtro: Record<string, unknown> = { motorSerie, parametro };
    if (opciones.fila) filtro['fila'] = opciones.fila;
    if (opciones.columna) filtro['columna'] = opciones.columna;

    const puntos = await this.hechos
      .find(filtro)
      .select('fechaEmision numeroInforme horasMotor valor estado fila columna')
      .sort({ fechaEmision: 1 })
      .lean()
      .exec();

    return puntos as unknown as PuntoDeSerie[];
  }

  /** Cuántos hechos tiene un informe. Lo usan los tests y la reconstrucción. */
  contar(reportId: string): Promise<number> {
    return this.hechos.countDocuments({ reportId }).exec();
  }

  private comoId(valor: unknown): Types.ObjectId | null {
    const texto = String(valor ?? '');
    return Types.ObjectId.isValid(texto) ? new Types.ObjectId(texto) : null;
  }

  private comoTexto(valor: unknown): string | null {
    const texto = String(valor ?? '').trim();
    return texto || null;
  }
}

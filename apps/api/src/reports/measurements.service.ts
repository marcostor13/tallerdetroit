import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import {
  claveDeCelda,
  findMeasurementTemplate,
  resolveGrid,
  type AppliedSpec,
  type EngineGridDimensions,
  type ValoresCapturados,
} from '@dps/shared';

/** Lo que llega del wizard: valores en crudo, sin estados ni tolerancias. */
export interface CapturaDeGrilla {
  readonly plantilla: string;
  readonly valores: Readonly<Record<string, number | null>>;
  readonly justificacion?: string | null;
}

/**
 * Validación de mediciones en el backend (E2.4).
 *
 * **El backend es la fuente de verdad.** El frontend evalúa con las mismas
 * funciones de `libs/shared` para dar retroalimentación inmediata, pero lo que
 * queda guardado —los estados, el veredicto, la tolerancia aplicada— lo calcula
 * aquí a partir de los valores en crudo. El cliente nunca envía un `estado`: si
 * pudiera, bastaría una petición hecha a mano para que un motor fuera de
 * tolerancia quedara registrado como correcto.
 *
 * Y la tolerancia se **congela** en la grilla (§12.4.3). Las de §12.5 son
 * provisionales y van a cambiar; un informe emitido tiene que seguir diciendo
 * con qué criterio se evaluó.
 */
@Injectable()
export class MeasurementsService {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  /**
   * Resuelve la grilla completa a partir de los valores capturados.
   *
   * `motor` viene denormalizado en el informe. Si no trae el modelo, no hay de
   * dónde sacar ni las dimensiones ni la tolerancia: se rechaza en vez de
   * inventar una grilla con un número de columnas cualquiera.
   */
  async resolver(
    motor: Record<string, unknown>,
    captura: CapturaDeGrilla,
    actorId: string,
  ): Promise<Record<string, unknown>> {
    const plantilla = findMeasurementTemplate(captura.plantilla);
    if (!plantilla) {
      throw new BadRequestException(`No existe la plantilla de medición «${captura.plantilla}».`);
    }

    const dimensiones = this.dimensionesDe(motor);
    const spec = await this.especificacionDe(motor, plantilla.parametro);

    // Solo los valores; cualquier `estado` que venga del cliente se descarta.
    const valores: ValoresCapturados = Object.fromEntries(
      Object.entries(captura.valores ?? {}).filter(([, v]) => v === null || typeof v === 'number'),
    );

    const grilla = resolveGrid(plantilla, dimensiones, valores, spec);

    const justifica = captura.justificacion?.trim() ? captura.justificacion.trim() : null;

    return {
      plantilla: grilla.codigo,
      nombre: grilla.nombre,
      unidad: grilla.unidad,
      filas: [...grilla.filas],
      columnas: [...grilla.columnas],
      valores: grilla.celdas.map((c) => ({
        fila: c.fila,
        columna: c.columna,
        valor: c.valor,
        estado: c.estado,
        calculado: c.calculado,
      })),
      // La copia, no la referencia: si mañana se corrige la spec, este informe
      // conserva el criterio con el que fue evaluado.
      especificacion: spec
        ? {
            nominal: spec.nominal,
            tolInf: spec.tolInf,
            tolSup: spec.tolSup,
            unidad: spec.unidad,
            fuente: spec.fuente,
            provisional: spec.provisional ?? false,
            modo: spec.modo ?? 'absoluto',
          }
        : null,
      resumen: { ...grilla.resumen },
      justificacion: justifica,
      justificadaPor: justifica ? new Types.ObjectId(actorId) : null,
    };
  }

  /**
   * Grillas que impiden emitir (RN-03).
   *
   * Un valor fuera de tolerancia no bloquea por sí solo: bloquea si nadie ha
   * escrito por qué se emite igual. El motor puede estar fuera de rango y ser
   * aceptable —una pieza que se va a rectificar, por ejemplo—, pero eso lo
   * decide una persona y tiene que quedar por escrito.
   */
  sinJustificar(bloques: readonly { titulo?: string | null; mediciones?: unknown[] }[]): {
    readonly bloque: string;
    readonly grilla: string;
    readonly fuera: number;
  }[] {
    const pendientes: { bloque: string; grilla: string; fuera: number }[] = [];

    for (const bloque of bloques) {
      for (const grilla of (bloque.mediciones ?? []) as {
        nombre?: string;
        resumen?: { fueraTolerancia?: number };
        justificacion?: string | null;
      }[]) {
        const fuera = grilla.resumen?.fueraTolerancia ?? 0;
        if (fuera > 0 && !grilla.justificacion?.trim()) {
          pendientes.push({
            bloque: bloque.titulo ?? 'Sin título',
            grilla: grilla.nombre ?? 'Grilla',
            fuera,
          });
        }
      }
    }

    return pendientes;
  }

  /** Grillas incompletas: dicen menos de lo que el informe aparenta. */
  incompletas(bloques: readonly { titulo?: string | null; mediciones?: unknown[] }[]): {
    readonly bloque: string;
    readonly grilla: string;
    readonly faltan: number;
  }[] {
    const parciales: { bloque: string; grilla: string; faltan: number }[] = [];

    for (const bloque of bloques) {
      for (const grilla of (bloque.mediciones ?? []) as {
        nombre?: string;
        resumen?: { capturadas?: number; esperadas?: number };
      }[]) {
        const capturadas = grilla.resumen?.capturadas ?? 0;
        const esperadas = grilla.resumen?.esperadas ?? 0;

        // Una grilla que ni se empezó no cuenta como incompleta: puede que ese
        // componente no se haya evaluado, y eso es una decisión legítima.
        if (capturadas > 0 && capturadas < esperadas) {
          parciales.push({
            bloque: bloque.titulo ?? 'Sin título',
            grilla: grilla.nombre ?? 'Grilla',
            faltan: esperadas - capturadas,
          });
        }
      }
    }

    return parciales;
  }

  // ---------------------------------------------------------------- privado

  private dimensionesDe(motor: Record<string, unknown>): EngineGridDimensions {
    const cilindros = Number(motor['cilindros']);
    const apoyosBancada = Number(motor['apoyosBancada']);
    const bancos = Number(motor['bancos'] ?? 2);

    if (!cilindros || !apoyosBancada) {
      throw new BadRequestException(
        'El informe no tiene el motor resuelto: sin cilindros ni apoyos de bancada ' +
          'no se puede saber cuántas columnas pide la grilla. Elige el motor por su ' +
          'número de serie en el paso de identificación.',
      );
    }

    return { cilindros, apoyosBancada, bancos };
  }

  /**
   * Busca la tolerancia del parámetro para el modelo de motor del informe.
   *
   * Devuelve `null` si no hay ninguna cargada. La grilla se captura igual pero
   * sin evaluar: con las de §12.5 todavía provisionales, inventar una sería
   * peor que no tenerla.
   */
  private async especificacionDe(
    motor: Record<string, unknown>,
    parametro: string,
  ): Promise<AppliedSpec | null> {
    const modeloId = motor['modeloId'] ?? motor['engineModelId'];
    if (!modeloId || !Types.ObjectId.isValid(String(modeloId))) return null;

    const modelo = this.connection.models['EngineSpec'];
    if (!modelo) return null;

    const spec = await modelo
      .findOne({ engineModelId: String(modeloId), parametro, deletedAt: null, activo: true })
      .lean()
      .exec();

    if (!spec) return null;

    const s = spec as unknown as AppliedSpec;
    return {
      nominal: s.nominal,
      tolInf: s.tolInf,
      tolSup: s.tolSup,
      unidad: s.unidad,
      fuente: s.fuente,
      provisional: s.provisional ?? false,
      modo: s.modo ?? 'absoluto',
    };
  }
}

/** Reexportado para quien construya capturas en tests o semillas. */
export { claveDeCelda };

/** Lanza si el informe no existe; lo usan los controladores. */
export function exigirInforme<T>(doc: T | null): T {
  if (!doc) throw new NotFoundException('No existe ese informe.');
  return doc;
}

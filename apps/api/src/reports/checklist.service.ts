import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import {
  CHECKLIST_STATES,
  checklistIncompleto,
  resolveChecklist,
  type ChecklistCapturado,
  type ChecklistItem,
  type ChecklistState,
  type DimensionesDeMotor,
} from '@dps/shared';

/** Lo que llega del wizard: qué se encontró de cada pieza. */
export interface CapturaDeChecklist {
  /** Catálogo del que sale el inventario. Si falta, se elige por el motor. */
  readonly clave?: string | null;
  readonly capturado?: readonly Record<string, unknown>[];
}

/** Bloque de inventario tal como queda en el informe. */
export interface ChecklistDelBloque {
  readonly checklistId: Types.ObjectId | null;
  readonly clave: string | null;
  readonly items: ChecklistItem[];
  readonly capturado: ChecklistCapturado[];
}

/**
 * Inventario de desarmado dentro del informe (E2.7, decisión D4).
 *
 * El catálogo —qué piezas se inventarían— vive en el maestro `checklists`; lo
 * inventariado vive en el bloque del informe. Al guardar se copia el catálogo
 * dentro del bloque, como con el resto de maestros: si mañana Calidad añade una
 * pieza, un informe ya emitido tiene que seguir diciendo qué se inventarió
 * aquel día, no lo que se inventariaría hoy.
 *
 * Las cantidades esperadas **no** se congelan aquí: se derivan del motor al
 * pintar (§12.2, `resolveChecklist`). Un 20V lleva veinte pistones y un 16V
 * dieciséis, y el motor del informe ya no cambia.
 */
@Injectable()
export class ChecklistService {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  /**
   * Resuelve el bloque de inventario a partir de lo capturado.
   *
   * Lo que llega del cliente se filtra: solo estados válidos y solo claves que
   * estén en el catálogo. Un estado inventado o una pieza que no existe en el
   * formato convertirían el inventario en algo que ya no es el SER-T-FOR-002.
   */
  async resolver(
    motor: Record<string, unknown>,
    captura: CapturaDeChecklist,
    anterior: ChecklistDelBloque | null = null,
  ): Promise<ChecklistDelBloque> {
    const catalogo = await this.catalogoDe(motor, captura.clave ?? anterior?.clave ?? null);

    if (!catalogo) {
      throw new BadRequestException(
        'No hay ningún inventario de desarmado cargado para este motor. ' +
          'Da de alta el catálogo en el maestro de checklists antes de inventariar.',
      );
    }

    const claves = new Set(catalogo.items.map((i) => i.clave));
    const estados = new Set<string>(CHECKLIST_STATES);

    const capturado: ChecklistCapturado[] = [];
    for (const bruto of captura.capturado ?? []) {
      const clave = String(bruto['clave'] ?? '');
      const estado = String(bruto['estado'] ?? '');
      if (!claves.has(clave) || !estados.has(estado)) continue;

      const cantidad = Number(bruto['cantidad']);
      const observacion = String(bruto['observacion'] ?? '').trim();

      capturado.push({
        clave,
        estado: estado as ChecklistState,
        cantidad: Number.isFinite(cantidad) ? cantidad : null,
        observacion: observacion || null,
      });
    }

    return {
      checklistId: catalogo.checklistId,
      clave: catalogo.clave,
      items: catalogo.items,
      capturado,
    };
  }

  /**
   * Inventarios a medias, que son los que impiden emitir.
   *
   * Que falten piezas o estén averiadas **no** bloquea: es precisamente lo que
   * el inventario documenta, y un motor llega como llega. Lo que bloquea es
   * dejarlo sin terminar, porque entonces el informe afirma menos de lo que
   * aparenta y lo que nadie miró se descubre al montar, tres semanas después.
   */
  incompletos(
    bloques: readonly { titulo?: string | null; checklist?: unknown }[],
    motor: DimensionesDeMotor = {},
  ): { readonly bloque: string; readonly faltan: number }[] {
    const pendientes: { bloque: string; faltan: number }[] = [];

    for (const bloque of bloques) {
      const checklist = bloque.checklist as ChecklistDelBloque | null | undefined;
      const items = checklist?.items ?? [];
      const capturado = checklist?.capturado ?? [];

      // Un inventario que ni se empezó no cuenta: puede que este informe no
      // documente un desarmado, y eso es una decisión legítima.
      if (!items.length || !capturado.length) continue;

      const faltan = checklistIncompleto(resolveChecklist(items, capturado, motor));
      if (faltan > 0) pendientes.push({ bloque: bloque.titulo ?? 'Inventario', faltan });
    }

    return pendientes;
  }

  // ---------------------------------------------------------------- privado

  /**
   * Catálogo que le toca a este motor.
   *
   * Por clave si el wizard la manda; si no, el que declare el modelo del motor;
   * y si ninguno lo declara, el genérico. La mayoría de los inventarios sirven
   * para cualquier motor de la familia, así que `aplicaAModelos` vacío significa
   * «todos» y no «ninguno».
   */
  private async catalogoDe(
    motor: Record<string, unknown>,
    clave: string | null,
  ): Promise<{
    checklistId: Types.ObjectId | null;
    clave: string;
    items: ChecklistItem[];
  } | null> {
    const modelo = this.connection.models['Checklist'];
    if (!modelo) return null;

    const base = { deletedAt: null, activo: true };

    const doc = clave
      ? await modelo
          .findOne({ ...base, clave })
          .lean()
          .exec()
      : ((await this.porModelo(motor)) ??
        (await modelo
          .findOne({ ...base })
          .lean()
          .exec()));

    if (!doc) return null;

    const bruto = doc as unknown as {
      _id: Types.ObjectId;
      clave: string;
      items?: Record<string, unknown>[];
    };

    return {
      checklistId: bruto._id ?? null,
      clave: bruto.clave,
      items: (bruto.items ?? []).map((i) => this.comoItem(i)),
    };
  }

  private async porModelo(motor: Record<string, unknown>) {
    const modeloId = motor['modeloId'] ?? motor['engineModelId'];
    if (!modeloId || !Types.ObjectId.isValid(String(modeloId))) return null;

    const modelo = this.connection.models['Checklist'];
    return modelo
      ? modelo
          .findOne({
            deletedAt: null,
            activo: true,
            aplicaAModelos: new Types.ObjectId(String(modeloId)),
          })
          .lean()
          .exec()
      : null;
  }

  private comoItem(bruto: Record<string, unknown>): ChecklistItem {
    const derivada = bruto['cantidadDerivadaDe'];
    const esperada = Number(bruto['cantidadEsperada']);

    return {
      clave: String(bruto['clave'] ?? ''),
      denominacion: String(bruto['denominacion'] ?? ''),
      grupo: bruto['grupo'] ? String(bruto['grupo']) : null,
      cantidadEsperada: Number.isFinite(esperada) ? esperada : null,
      cantidadDerivadaDe: derivada
        ? (String(derivada) as ChecklistItem['cantidadDerivadaDe'])
        : null,
    };
  }
}

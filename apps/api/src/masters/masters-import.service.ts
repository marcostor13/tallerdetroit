import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types, type Model } from 'mongoose';
import { csvToRecords } from '@dps/shared';
import { MastersService } from './masters.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';

type MasterDocument = Record<string, unknown>;

export interface ErrorDeImportacion {
  readonly linea: number;
  readonly motivo: string;
  readonly datos: Record<string, string>;
}

export interface ResultadoDeImportacion {
  readonly total: number;
  readonly creados: number;
  readonly actualizados: number;
  readonly errores: ErrorDeImportacion[];
  readonly simulacion: boolean;
}

/** Cuántas filas se admiten de una vez. */
const MAX_FILAS = 5_000;

/**
 * Carga masiva y fusión de duplicados (§13.2, §13.3.5).
 *
 * La carga inicial la trae el negocio en Excel, y ahí es donde se decide si los
 * maestros arrancan con datos o no. Dos decisiones gobiernan el diseño:
 *
 * · **Una fila mala no tumba el archivo.** Si 4.000 equipos se rechazan porque
 *   la fila 317 tiene el RUC mal, nadie repite la carga: se vuelve al Excel.
 *   Se importa lo que vale y se devuelve la lista de lo que no, con su número
 *   de línea, que es lo que el usuario ve al abrir el archivo.
 *
 * · **Se puede simular antes de escribir.** Un importador que solo se puede
 *   probar escribiendo obliga a limpiar la base a mano cuando el mapeo de
 *   columnas resultó ser otro.
 */
@Injectable()
export class MastersImportService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly maestros: MastersService,
  ) {}

  async importar(
    key: string,
    csv: string,
    actor: AuthUser,
    opciones: { simulacion?: boolean; claveUnica?: string } = {},
  ): Promise<ResultadoDeImportacion> {
    const definicion = this.maestros.definition(key);
    const filas = csvToRecords(csv);

    if (!filas.length) {
      throw new BadRequestException('El archivo no tiene ninguna fila de datos.');
    }
    if (filas.length > MAX_FILAS) {
      throw new BadRequestException(
        `El archivo trae ${filas.length} filas y el máximo son ${MAX_FILAS}. Pártelo en varios.`,
      );
    }

    const modelo = this.modelo(definicion.model);
    // Con qué campo se decide si la fila es nueva o ya existía. Por defecto, el
    // que se muestra: es el que el negocio reconoce como identificador.
    const clave = opciones.claveUnica ?? definicion.displayField;
    const simulacion = opciones.simulacion === true;

    const errores: ErrorDeImportacion[] = [];
    let creados = 0;
    let actualizados = 0;

    for (const fila of filas) {
      const valor = fila.datos[clave];

      if (!valor) {
        errores.push({
          linea: fila.linea,
          motivo: `Falta «${clave}», que es lo que identifica el registro.`,
          datos: fila.datos,
        });
        continue;
      }

      try {
        const existente = await modelo
          .findOne({ [clave]: valor, deletedAt: null })
          .lean()
          .exec();

        if (simulacion) {
          if (existente) actualizados++;
          else creados++;
          continue;
        }

        if (existente) {
          // Se actualiza en vez de rechazar: la carga se repite varias veces
          // mientras el negocio corrige su Excel, y fallar por duplicado en la
          // segunda pasada haría el importador inservible.
          await modelo.updateOne(
            { _id: existente['_id'] as Types.ObjectId },
            { $set: { ...fila.datos, updatedBy: new Types.ObjectId(actor.id) } },
          );
          actualizados++;
        } else {
          await modelo.create({
            ...fila.datos,
            createdBy: new Types.ObjectId(actor.id),
            updatedBy: new Types.ObjectId(actor.id),
          });
          creados++;
        }
      } catch (error: unknown) {
        errores.push({
          linea: fila.linea,
          motivo: this.motivo(error),
          datos: fila.datos,
        });
      }
    }

    return { total: filas.length, creados, actualizados, errores, simulacion };
  }

  /**
   * Fusiona dos registros duplicados (§13.3.5).
   *
   * `TOQUEPALA` y `SPCC. TOQUEPALA` son el mismo cliente escrito de dos formas,
   * y mientras convivan no hay analítica que valga. El sobrante no se borra:
   * queda con `fusionadoEn` apuntando al que se queda, porque los informes
   * emitidos guardan su identificador y tienen que poder seguir resolviéndolo.
   */
  async fusionar(
    key: string,
    idQueSeQueda: string,
    idSobrante: string,
    actor: AuthUser,
  ): Promise<{ fusionado: true; referenciasReapuntadas: number }> {
    const definicion = this.maestros.definition(key);

    if (idQueSeQueda === idSobrante) {
      throw new BadRequestException('No se puede fusionar un registro consigo mismo.');
    }

    // Ambos tienen que existir antes de tocar nada.
    await this.maestros.findById(key, idQueSeQueda);
    await this.maestros.findById(key, idSobrante);

    const reapuntadas = await this.reapuntarReferencias(definicion.model, idSobrante, idQueSeQueda);

    await this.modelo(definicion.model).updateOne(
      { _id: idSobrante },
      {
        $set: {
          activo: false,
          deletedAt: new Date(),
          fusionadoEn: new Types.ObjectId(idQueSeQueda),
          updatedBy: new Types.ObjectId(actor.id),
        },
      },
    );

    return { fusionado: true, referenciasReapuntadas: reapuntadas };
  }

  /**
   * Reapunta al registro superviviente todo lo que señalaba al sobrante.
   *
   * Se recorren las rutas que referencian ese modelo en cada schema, en vez de
   * mantener a mano una lista de colecciones: añadir un maestro nuevo no debe
   * obligar a acordarse de tocar esto.
   */
  private async reapuntarReferencias(
    modelo: string,
    sobrante: string,
    superviviente: string,
  ): Promise<number> {
    let total = 0;

    for (const nombre of Object.keys(this.connection.models)) {
      const otro = this.connection.models[nombre];
      if (!otro) continue;

      const rutas = Object.entries(otro.schema.paths)
        .filter(([, ruta]) => (ruta as { options?: { ref?: string } }).options?.ref === modelo)
        .map(([nombreDeRuta]) => nombreDeRuta);

      for (const ruta of rutas) {
        const { modifiedCount } = await otro.updateMany(
          { [ruta]: new Types.ObjectId(sobrante) },
          { $set: { [ruta]: new Types.ObjectId(superviviente) } },
        );
        total += modifiedCount;
      }
    }

    return total;
  }

  private modelo(nombre: string): Model<MasterDocument> {
    return this.connection.models[nombre] as unknown as Model<MasterDocument>;
  }

  private motivo(error: unknown): string {
    const e = error as { code?: number; keyValue?: Record<string, unknown>; message?: string };
    if (e?.code === 11000) {
      const campos = Object.entries(e.keyValue ?? {})
        .map(([k, v]) => `${k} «${String(v)}»`)
        .join(', ');
      return `Ya existe otro registro con ${campos || 'esos datos'}.`;
    }
    return e?.message ?? 'No se pudo importar la fila.';
  }
}

import type { OperacionOffline } from '@dps/shared';
import type { BaseLocal, FotoLocal, InformeLocal, PlantillaLocal } from '../sync.db';

/**
 * Base local en memoria, solo para las pruebas.
 *
 * jsdom no trae IndexedDB: contra la base de verdad, o las operaciones fallan y
 * los `catch` del servicio se las tragan, o se quedan colgadas esperando una
 * conexión que nunca abre. En los dos casos el código de sin-conexión pasaría
 * los tests sin llegar a ejecutarse. Esto implementa el trocito de la API de
 * Dexie que el proyecto usa —lo justo, no la biblioteca entera— para que lo que
 * se comprueba sea el comportamiento.
 */
class TablaFalsa<T> {
  readonly filas = new Map<string, T>();

  constructor(private readonly clave: string) {}

  private id(fila: T): string {
    return String((fila as Record<string, unknown>)[this.clave]);
  }

  put = async (fila: T): Promise<void> => {
    this.filas.set(this.id(fila), fila);
  };

  get = async (id: string): Promise<T | undefined> => this.filas.get(id);

  delete = async (id: string): Promise<void> => {
    this.filas.delete(id);
  };

  bulkDelete = async (ids: readonly string[]): Promise<void> => {
    for (const id of ids) this.filas.delete(id);
  };

  bulkPut = async (nuevas: readonly T[]): Promise<void> => {
    for (const fila of nuevas) this.filas.set(this.id(fila), fila);
  };

  toArray = async (): Promise<T[]> => [...this.filas.values()];

  orderBy(campo: string): ConsultaFalsa<T> {
    return new ConsultaFalsa(
      [...this.filas.values()].sort((a, b) =>
        String((a as Record<string, unknown>)[campo]).localeCompare(
          String((b as Record<string, unknown>)[campo]),
        ),
      ),
    );
  }
}

class ConsultaFalsa<T> {
  constructor(private readonly filas: readonly T[]) {}

  reverse = (): ConsultaFalsa<T> => new ConsultaFalsa([...this.filas].reverse());
  limit = (cuantas: number): ConsultaFalsa<T> => new ConsultaFalsa(this.filas.slice(0, cuantas));
  toArray = async (): Promise<T[]> => [...this.filas];
}

export interface BaseLocalFalsa {
  readonly informes: TablaFalsa<InformeLocal>;
  readonly fotos: TablaFalsa<FotoLocal>;
  readonly operaciones: TablaFalsa<OperacionOffline>;
  readonly plantillas: TablaFalsa<PlantillaLocal>;
  transaction<T>(modo: string, tabla: unknown, cuerpo: () => Promise<T>): Promise<T>;
  vaciar(): void;
}

export function baseLocalFalsa(): BaseLocalFalsa {
  const base: BaseLocalFalsa = {
    informes: new TablaFalsa<InformeLocal>('id'),
    fotos: new TablaFalsa<FotoLocal>('id'),
    operaciones: new TablaFalsa<OperacionOffline>('clientOpId'),
    plantillas: new TablaFalsa<PlantillaLocal>('clave'),

    /** Dexie ejecuta el cuerpo de la transacción; aquí basta con eso. */
    transaction: async (_modo, _tabla, cuerpo) => cuerpo(),

    vaciar: () => {
      base.informes.filas.clear();
      base.fotos.filas.clear();
      base.operaciones.filas.clear();
      base.plantillas.filas.clear();
    },
  };

  return base;
}

/** Para pasarla al token `BASE_LOCAL`, que espera la clase de Dexie. */
export function comoBaseLocal(base: BaseLocalFalsa): BaseLocal {
  return base as unknown as BaseLocal;
}

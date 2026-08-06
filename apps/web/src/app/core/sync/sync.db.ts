import Dexie, { type Table } from 'dexie';
import type { OperacionOffline } from '@dps/shared';

/** Un informe guardado en el dispositivo, tal como se ve sin red. */
export interface InformeLocal {
  /** El id del servidor, o uno `local:` mientras no exista allí. */
  id: string;
  numeroInforme: string;
  /** El documento completo, tal como lo devolvería la API. */
  datos: Record<string, unknown>;
  actualizadoEn: string;
}

/** Una foto capturada sin red, todavía sin subir a S3. */
export interface FotoLocal {
  id: string;
  informeId: string;
  bloqueId: string;
  /** El archivo comprimido. En IndexedDB caben; en `localStorage` no. */
  blob: Blob;
  caption: string;
  capturadaEn: string;
}

/**
 * Base local de la PWA (E4.3).
 *
 * IndexedDB y no `localStorage` por una razón que decide el diseño entero: las
 * fotos. Veinte fotografías de taller son varios megas y `localStorage` guarda
 * texto con un tope de unos cinco; con IndexedDB caben como `Blob` y sin
 * convertirlas a base64, que las engordaría un tercio.
 *
 * Las tres tablas son las tres cosas que el técnico no puede perder: lo que
 * escribió, lo que fotografió y lo que falta por mandar.
 */
export class BaseLocal extends Dexie {
  informes!: Table<InformeLocal, string>;
  fotos!: Table<FotoLocal, string>;
  operaciones!: Table<OperacionOffline, string>;

  constructor() {
    super('dps-informes');

    this.version(1).stores({
      informes: 'id, numeroInforme, actualizadoEn',
      fotos: 'id, informeId, bloqueId',
      // Se indexa por estado e informe: la cola se consulta por «qué queda
      // pendiente» y por «qué falta de este informe», nunca por clave suelta.
      operaciones: 'clientOpId, estado, informeId, capturadaEn',
    });
  }
}

/**
 * Una sola instancia para toda la app.
 *
 * Dos conexiones a la misma base de IndexedDB bloquean las migraciones de
 * versión: la segunda se queda esperando a que la primera cierre, y la app se
 * congela al arrancar sin decir por qué.
 */
export const baseLocal = new BaseLocal();

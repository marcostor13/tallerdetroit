import { InjectionToken } from '@angular/core';
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

/**
 * La plantilla vigente, guardada para poder crear un informe sin red.
 *
 * Sin ella el editor no sabe qué secciones pintar, así que un informe creado en
 * el socavón sería una pantalla en blanco. Se guarda la que trae cada informe
 * que se abre con conexión: para cuando el técnico baja a la mina, ya está.
 */
export interface PlantillaLocal {
  /** `SER-FOR-002:v01`. */
  clave: string;
  codigo: string;
  version: string;
  definicion: Record<string, unknown>;
  guardadaEn: string;
}

/**
 * Un registro de maestro guardado en el dispositivo (E4.2).
 *
 * La clave lleva la colección delante porque el id de un cliente y el de una
 * sede pueden coincidir sin que eso signifique nada: son colecciones distintas
 * de Mongo. Con una tabla por maestro habría que migrar el esquema cada vez que
 * se cachea uno nuevo.
 */
export interface MaestroLocal {
  /** `clients:64f…`. */
  clave: string;
  coleccion: string;
  registroId: string;
  datos: Record<string, unknown>;
}

/** Hasta dónde está sincronizado cada maestro. */
export interface EstadoDeMaestroLocal {
  coleccion: string;
  /** `hasta` de la última respuesta correcta del servidor. */
  sincronizadoHasta: string;
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
  plantillas!: Table<PlantillaLocal, string>;
  maestros!: Table<MaestroLocal, string>;
  maestrosEstado!: Table<EstadoDeMaestroLocal, string>;

  constructor() {
    super('dps-informes');

    this.version(1).stores({
      informes: 'id, numeroInforme, actualizadoEn',
      fotos: 'id, informeId, bloqueId',
      // Se indexa por estado e informe: la cola se consulta por «qué queda
      // pendiente» y por «qué falta de este informe», nunca por clave suelta.
      operaciones: 'clientOpId, estado, informeId, capturadaEn',
    });

    // La versión 2 añade las plantillas. Dexie migra solo y conserva lo que ya
    // hubiera: un técnico con informes sin sincronizar no puede perderlos por
    // actualizar la app.
    this.version(2).stores({
      plantillas: 'clave, codigo, guardadaEn',
    });

    // La 3 añade la caché de maestros (E4.2). `coleccion` va indexado porque
    // toda consulta es «dame los de este catálogo»: sin índice, buscar un
    // cliente recorrería también los ocho mil repuestos.
    this.version(3).stores({
      maestros: 'clave, coleccion, registroId',
      maestrosEstado: 'coleccion',
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

/**
 * La base local, por inyección.
 *
 * Importar el singleton directamente ataba cada servicio a IndexedDB, y en las
 * pruebas —que corren en jsdom, donde IndexedDB no existe— las operaciones se
 * quedaban colgadas o fallaban en silencio: el código de sin-conexión pasaba
 * los tests sin ejecutarse. Con un token se puede poner una base en memoria y
 * comprobar lo que de verdad hace.
 */
export const BASE_LOCAL = new InjectionToken<BaseLocal>('dps.baseLocal', {
  providedIn: 'root',
  factory: () => baseLocal,
});

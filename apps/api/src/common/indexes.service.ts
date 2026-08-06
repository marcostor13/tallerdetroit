import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

/**
 * Crea los índices declarados en los schemas antes de que la aplicación empiece
 * a atender peticiones.
 *
 * Sin esto había un agujero silencioso. `autoIndex` está apagado en producción
 * —lo correcto, porque construir índices en cada arranque castiga a una base
 * grande— así que allí los índices únicos sencillamente **no existían**. Y
 * `numero` de las órdenes de trabajo o `ruc` de los clientes son únicos por un
 * motivo: sin el índice, dos informes pueden compartir número y la plataforma
 * los da por distintos. Es el criterio RN-01 incumpliéndose sin que nada falle.
 *
 * Con `autoIndex` encendido tampoco bastaba: Mongoose lanza la construcción en
 * segundo plano y no la espera, así que las primeras peticiones tras el arranque
 * corren contra una colección todavía sin índice. Peor aún, si en esa ventana
 * entra un duplicado, la construcción del índice único falla y la colección se
 * queda sin él para siempre.
 *
 * `createIndexes()` no borra nada: solo añade lo que falta. Se prefiere a
 * `syncIndexes()`, que elimina los índices que no estén en el schema y podría
 * llevarse por delante uno creado a mano en Atlas para una consulta concreta.
 */
@Injectable()
export class IndexesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(IndexesService.name);

  constructor(@InjectConnection() private readonly connection: Connection) {}

  async onApplicationBootstrap(): Promise<void> {
    const modelos = Object.values(this.connection.models);
    const fallos: string[] = [];

    for (const modelo of modelos) {
      try {
        await modelo.createIndexes();
      } catch (error: unknown) {
        // Un índice que no se puede construir casi siempre significa que los
        // datos ya violan la restricción. Se registra con nombre y motivo en
        // vez de tumbar el arranque: dejar la API caída no arregla los datos,
        // y el mensaje dice exactamente qué hay que limpiar.
        fallos.push(`${modelo.modelName}: ${(error as Error).message}`);
      }
    }

    if (fallos.length) {
      this.logger.error(`No se pudieron crear todos los índices:\n· ${fallos.join('\n· ')}`);
      return;
    }

    this.logger.log(`Índices verificados en ${modelos.length} colecciones.`);
  }
}

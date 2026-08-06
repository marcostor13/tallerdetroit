import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { TemplateVersionDefinition } from '@dps/shared';
import { MediaService } from '../media/media.service';

export const COLA_DOCUMENTOS = 'documentos';

/** Más allá de esto se da el encolado por perdido y se sigue. */
const TIEMPO_MAXIMO_DE_ENCOLADO = 3_000;

/**
 * Encola el render del PDF al emitir un informe (E1.7).
 *
 * Va a una cola y no se hace en línea porque un informe de 45 fotos tarda
 * decenas de segundos: dejar al técnico mirando una pantalla todo ese rato, con
 * el riesgo de que un tiempo de espera del proxy corte la petición a medias,
 * convierte el momento más importante del flujo en el más frágil.
 */
@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    @InjectQueue(COLA_DOCUMENTOS) private readonly cola: Queue,
    private readonly media: MediaService,
  ) {}

  async encolarPdf(
    informeId: string,
    informe: Record<string, unknown>,
    plantilla: TemplateVersionDefinition,
  ): Promise<void> {
    try {
      // Las URLs firmadas se resuelven aquí y no en el worker: así el worker no
      // necesita credenciales de lectura del bucket, solo de escritura.
      const claves = this.clavesDeFoto(informe);
      const imagenes = await this.firmarTodas(claves);

      // Con un tope de tiempo: el informe ya está emitido y congelado, así que
      // ni una Redis lenta ni una caída pueden dejar colgada la respuesta del
      // momento más importante del flujo.
      await this.conTope(
        this.cola.add(
          'pdf',
          { informeId, informe, plantilla, imagenes },
          { jobId: `pdf:${informeId}:${Date.now()}` },
        ),
        TIEMPO_MAXIMO_DE_ENCOLADO,
      );
    } catch (error: unknown) {
      // Que falle el encolado no debe deshacer la emisión: el informe ya está
      // emitido y congelado, y el PDF se puede volver a pedir. Lo contrario
      // —revertir un documento controlado por un problema de Redis— sería peor.
      this.logger.error(
        `No se pudo encolar el PDF del informe ${informeId}: ${(error as Error).message}`,
      );
    }
  }

  /** Corre la promesa con un tope de tiempo; si se pasa, falla en vez de colgar. */
  private async conTope<T>(promesa: Promise<T>, ms: number): Promise<T> {
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promesa,
        new Promise<never>((_, rechazar) => {
          temporizador = setTimeout(
            () => rechazar(new Error(`La cola no respondió en ${ms} ms.`)),
            ms,
          );
        }),
      ]);
    } finally {
      clearTimeout(temporizador);
    }
  }

  private clavesDeFoto(informe: Record<string, unknown>): string[] {
    const bloques = (informe['bloques'] ?? []) as {
      fotos?: { s3Key?: string; printKey?: string }[];
    }[];
    return [
      ...new Set(
        bloques.flatMap((b) => (b.fotos ?? []).map((f) => f.printKey || f.s3Key).filter(Boolean)),
      ),
    ] as string[];
  }

  private async firmarTodas(claves: string[]): Promise<Record<string, string>> {
    const entradas = await Promise.all(
      claves.map(async (clave) => {
        try {
          return [clave, await this.media.firmarLectura(clave)] as const;
        } catch {
          // Una foto que no se puede firmar sale como hueco en el PDF; parar
          // el documento entero por una imagen sería desproporcionado.
          return [clave, clave] as const;
        }
      }),
    );
    return Object.fromEntries(entradas);
  }
}

import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
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
    private readonly config: ConfigService,
  ) {}

  /**
   * Dónde vive el PDF de un informe (E3.4).
   *
   * La calcula la API y viaja en el trabajo, en vez de derivarla dos veces por
   * separado: si el worker la construyera por su cuenta, un cambio en una de
   * las dos dejaría los documentos donde nadie los busca.
   *
   * El año sale de la fecha de emisión, no de `Date.now()`. Un informe emitido
   * en diciembre cuyo PDF se pida en enero tiene que seguir estando donde
   * estaba: con el año actual, la clave cambiaría sola al pasar de año y la
   * reimpresión no encontraría nada.
   */
  claveDePdf(
    informeId: string,
    numeroInforme: string,
    fechaEmision?: Date | string | null,
  ): string {
    return this.claveDeDocumento(informeId, numeroInforme, 'pdf', fechaEmision);
  }

  /** La misma regla para cualquier formato: solo cambia la extensión (E3.5). */
  claveDeDocumento(
    informeId: string,
    numeroInforme: string,
    tipo: 'pdf' | 'docx',
    fechaEmision?: Date | string | null,
  ): string {
    const fecha = fechaEmision ? new Date(fechaEmision) : new Date();
    const anio = isNaN(fecha.getTime()) ? new Date().getFullYear() : fecha.getFullYear();
    return `informes/${anio}/${informeId}/${numeroInforme}.${tipo}`;
  }

  /** Metadatos del PDF ya subido, o `null` si el worker no ha terminado. */
  describir(s3Key: string) {
    return this.media.describir(s3Key);
  }

  firmarLectura(s3Key: string): Promise<string> {
    return this.media.firmarLectura(s3Key);
  }

  /**
   * A dónde lleva el QR del pie (E3.6).
   *
   * Sale de `PUBLIC_APP_URL` y no del primer origen de CORS: el QR va impreso
   * en un documento que dura años, y no puede depender de cuál sea el primer
   * elemento de una lista que alguien reordene un día.
   */
  urlDeVerificacion(numeroInforme: string): string {
    const base = (this.config.get<string>('PUBLIC_APP_URL') ?? '').replace(/\/+$/, '');
    return `${base}/v/${encodeURIComponent(numeroInforme)}`;
  }

  async encolarPdf(
    informeId: string,
    informe: Record<string, unknown>,
    plantilla: TemplateVersionDefinition,
    s3Key?: string,
    urlVerificacion?: string,
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
          { informeId, informe, plantilla, imagenes, s3Key, urlVerificacion },
          { jobId: `pdf:${informeId}:${Date.now()}` },
        ),
        TIEMPO_MAXIMO_DE_ENCOLADO,
      );

      // El DOCX va detrás y en su propio trabajo (E3.5). Si se generara dentro
      // del mismo, un fallo al descargar una foto para el Word se llevaría por
      // delante el PDF, que es el documento que de verdad se entrega.
      await this.conTope(
        this.cola.add(
          'docx',
          {
            informeId,
            informe,
            plantilla,
            imagenes,
            s3Key: s3Key?.replace(/\.pdf$/, '.docx'),
          },
          { jobId: `docx:${informeId}:${Date.now()}` },
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

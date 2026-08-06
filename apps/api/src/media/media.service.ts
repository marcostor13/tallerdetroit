import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { AuthUser } from '../common/decorators/current-user.decorator';

/** Lo que el navegador puede producir tras comprimir. */
const TIPOS_ADMITIDOS = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Tope del archivo subido, ya comprimido en el cliente.
 *
 * A 1600 px y calidad 80 una foto de taller ronda los 300 KB. Ocho megas dejan
 * margen de sobra y a la vez impiden que alguien suba el original de 12 MP sin
 * pasar por la compresión, que es lo que hincharía la factura de S3 y el tiempo
 * de subida desde el móvil del técnico.
 */
const MAX_BYTES = 8 * 1024 * 1024;

export interface SubidaPrefirmada {
  readonly url: string;
  readonly s3Key: string;
  readonly expiraEn: number;
  readonly maxBytes: number;
}

/**
 * Evidencia fotográfica (§16.2, E1.6).
 *
 * Las fotos no pasan por la API: el navegador las sube directamente a S3 con una
 * URL firmada. Encaminarlas por el servidor significaría que 45 fotos de un
 * informe atraviesan el proceso de Node dos veces —entrada y salida— y bastaría
 * un par de técnicos subiendo a la vez para tumbar la API.
 *
 * En Mongo solo queda la clave. Es lo que permite que el documento del informe
 * se mantenga por debajo de 1 MB con 45 fotos, criterio de aceptación de F1,
 * frente a los 17 MB que pesa hoy el Word equivalente.
 */
@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly cliente: S3Client | null;
  private readonly bucket: string | null;
  private readonly ttl: number;

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.get<string>('AWS_S3_BUCKET') ?? null;
    this.ttl = Number(this.config.get<string>('S3_SIGNED_URL_TTL') ?? 900);

    const region = this.config.get<string>('AWS_REGION');
    const endpoint = this.config.get<string>('S3_ENDPOINT');
    const accessKeyId = this.config.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('AWS_SECRET_ACCESS_KEY');

    if (!this.bucket || !region) {
      // Sin almacén configurado la plataforma arranca igual: en desarrollo se
      // trabaja sobre los demás módulos sin necesidad de credenciales de AWS.
      // Lo que no puede es fallar en silencio cuando alguien intente subir.
      this.cliente = null;
      this.logger.warn('Sin S3 configurado: la subida de fotografías quedará deshabilitada.');
      return;
    }

    this.cliente = new S3Client({
      region,
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
      ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
    });
  }

  /**
   * URL para subir una foto de un informe.
   *
   * La clave la construye el servidor y no el cliente: si el navegador eligiera
   * la ruta, podría escribir sobre las fotos de otro informe.
   */
  async firmarSubida(informeId: string, tipo: string, actor: AuthUser): Promise<SubidaPrefirmada> {
    const s3 = this.exigirCliente();

    if (!TIPOS_ADMITIDOS.has(tipo)) {
      throw new BadRequestException(`Formato no admitido: ${tipo}. Se aceptan JPEG, PNG y WebP.`);
    }

    const extension = tipo.split('/')[1] ?? 'jpg';
    const anio = new Date().getFullYear();
    const s3Key = `informes/${anio}/${informeId}/${randomUUID()}.${extension}`;

    const url = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: this.bucket as string,
        Key: s3Key,
        ContentType: tipo,
        Metadata: { informeid: informeId, subidopor: actor.id },
      }),
      { expiresIn: this.ttl },
    );

    return { url, s3Key, expiraEn: this.ttl, maxBytes: MAX_BYTES };
  }

  /** URL temporal de lectura, para la vista previa y el render. */
  async firmarLectura(s3Key: string): Promise<string> {
    const s3 = this.exigirCliente();
    return getSignedUrl(s3, new GetObjectCommand({ Bucket: this.bucket as string, Key: s3Key }), {
      expiresIn: this.ttl,
    });
  }

  /**
   * Metadatos del objeto, o `null` si todavía no existe (E3.4).
   *
   * Lo usa la descarga del documento emitido: el worker sube el PDF con su
   * hash en los metadatos, y la API lo lee de ahí en vez de volver a
   * renderizar. Un render nuevo daría otro hash aunque el contenido fuera
   * idéntico —basta con que cambie la fecha de creación del PDF— y el archivo
   * que tiene el cliente dejaría de validar.
   */
  async describir(s3Key: string): Promise<{ hash: string | null; bytes: number | null } | null> {
    if (!this.cliente) return null;

    try {
      const salida = await this.cliente.send(
        new HeadObjectCommand({ Bucket: this.bucket as string, Key: s3Key }),
      );
      return {
        // S3 devuelve los metadatos de usuario en minúsculas, siempre.
        hash: salida.Metadata?.['hash'] ?? null,
        bytes: salida.ContentLength ?? null,
      };
    } catch {
      // Un 404 aquí es lo normal mientras el worker no ha terminado: no es un
      // error, es «todavía no está».
      return null;
    }
  }

  private exigirCliente(): S3Client {
    if (!this.cliente) {
      throw new BadRequestException(
        'El almacenamiento de fotografías no está configurado en este entorno.',
      );
    }
    return this.cliente;
  }
}

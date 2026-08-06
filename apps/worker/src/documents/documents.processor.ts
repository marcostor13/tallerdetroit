import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Job } from 'bullmq';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import {
  buildDocxModel,
  renderReportHtml,
  type InformeRenderizable,
  type TemplateVersionDefinition,
} from '@dps/shared';
import { toString as qrToString } from 'qrcode';
import { PdfRenderer } from './pdf.renderer';
import { DocxRenderer } from './docx.renderer';

export const COLA_DOCUMENTOS = 'documentos';

export interface TrabajoDePdf {
  readonly informeId: string;
  /** Clave de S3, calculada por la API para que las dos partes coincidan. */
  readonly s3Key?: string;
  readonly informe: InformeRenderizable;
  readonly plantilla: TemplateVersionDefinition;
  /** `s3Key` → URL firmada de lectura, resueltas por la API antes de encolar. */
  readonly imagenes: Record<string, string>;
  readonly logo?: string;
  /** A dónde lleva el QR del pie: la vista pública de verificación (E3.6). */
  readonly urlVerificacion?: string;
}

export interface ResultadoDeDocumento {
  /** Lo devuelve para que la API sepa a qué informe anotarlo (E3.4). */
  readonly informeId: string;
  readonly tipo: 'pdf' | 'docx';
  readonly s3Key: string;
  readonly hash: string;
  readonly bytes: number;
  readonly milisegundos: number;
}

/** Nombre anterior, conservado para no romper a quien lo importe. */
export type ResultadoDePdf = ResultadoDeDocumento;

/**
 * Generación del PDF del informe (E1.7).
 *
 * Vive en el worker y no en la API a propósito: cada render consume entre 300 y
 * 600 MB, y dentro de la API un informe de 60 fotos tumbaría el servicio para
 * todos los usuarios (§15.2, riesgo R6).
 *
 * El HTML lo produce `renderReportHtml` de `libs/shared`, la misma función que
 * pinta la vista previa del wizard. No hay dos plantillas que mantener
 * sincronizadas, que es lo que hace cierto el «lo que ves es lo que sale».
 */
@Processor(COLA_DOCUMENTOS)
export class DocumentsProcessor extends WorkerHost {
  private readonly logger = new Logger(DocumentsProcessor.name);
  private readonly s3: S3Client | null;
  private readonly bucket: string | null;

  constructor(
    private readonly renderer: PdfRenderer,
    private readonly docx: DocxRenderer,
    private readonly config: ConfigService,
  ) {
    super();

    this.bucket = this.config.get<string>('AWS_S3_BUCKET') ?? null;
    const region = this.config.get<string>('AWS_REGION');
    const endpoint = this.config.get<string>('S3_ENDPOINT');
    const accessKeyId = this.config.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('AWS_SECRET_ACCESS_KEY');

    this.s3 =
      this.bucket && region
        ? new S3Client({
            region,
            ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
            ...(accessKeyId && secretAccessKey
              ? { credentials: { accessKeyId, secretAccessKey } }
              : {}),
          })
        : null;
  }

  async process(job: Job<TrabajoDePdf>): Promise<ResultadoDeDocumento> {
    // El nombre del trabajo decide el formato. Dos colas separadas competirían
    // por el mismo Chromium sin necesidad: lo pesado es el PDF, y el DOCX que
    // se genera después reutiliza el mismo proceso.
    return job.name === 'docx' ? this.generarDocx(job) : this.generarPdf(job);
  }

  /**
   * Export a Word (E3.5).
   *
   * Las fotos se descargan aquí, de las mismas URLs firmadas que usa el PDF: en
   * un `.docx` las imágenes van **dentro** del archivo, no enlazadas, porque un
   * Word cuyas fotos apuntan a una URL caducada se abre en blanco a los quince
   * minutos.
   */
  private async generarDocx(job: Job<TrabajoDePdf>): Promise<ResultadoDeDocumento> {
    const inicio = Date.now();
    const { informeId, informe, plantilla, imagenes } = job.data;

    const modelo = buildDocxModel(informe, plantilla);
    const descargadas = await this.descargar(imagenes);
    const archivo = await this.docx.generar(modelo, descargadas);

    const hash = `sha256:${createHash('sha256').update(archivo).digest('hex')}`;
    const s3Key =
      job.data.s3Key ??
      `informes/${new Date().getFullYear()}/${informeId}/${informe.numeroInforme}.docx`;

    if (this.s3 && this.bucket) {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: s3Key,
          Body: archivo,
          ContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          Metadata: { informeid: informeId, hash },
        }),
      );
    } else {
      this.logger.warn(`Sin S3 configurado: el DOCX de ${informe.numeroInforme} no se guardó.`);
    }

    const milisegundos = Date.now() - inicio;
    this.logger.log(
      `DOCX de ${informe.numeroInforme}: ${Math.round(archivo.length / 1024)} KB, ${milisegundos} ms.`,
    );

    return { informeId, tipo: 'docx', s3Key, hash, bytes: archivo.length, milisegundos };
  }

  /**
   * Descarga las fotos para incrustarlas.
   *
   * Una que falle se omite: el informe sale sin esa imagen pero con su pie, que
   * es mejor que no salir. Un `.docx` que no se genera porque una foto dio 403
   * deja al técnico sin el documento que necesita entregar.
   */
  private async descargar(urls: Record<string, string>): Promise<Record<string, Buffer>> {
    const entradas = await Promise.all(
      Object.entries(urls).map(async ([clave, url]) => {
        try {
          const respuesta = await fetch(url);
          if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
          return [clave, Buffer.from(await respuesta.arrayBuffer())] as const;
        } catch (e: unknown) {
          this.logger.warn(`No se pudo descargar ${clave}: ${String(e)}`);
          return null;
        }
      }),
    );

    return Object.fromEntries(entradas.filter((e): e is [string, Buffer] => e !== null));
  }

  private async generarPdf(job: Job<TrabajoDePdf>): Promise<ResultadoDeDocumento> {
    const inicio = Date.now();
    const { informeId, informe, plantilla, imagenes, logo } = job.data;

    const { urlVerificacion } = job.data;

    const componer = (verificacion?: { url?: string; qr?: string; hash?: string }) =>
      renderReportHtml(informe, plantilla, {
        // Las URLs firmadas las resuelve la API antes de encolar: el worker no
        // tiene por qué conocer las credenciales de lectura del bucket.
        resolverImagen: (clave) => imagenes[clave] ?? clave,
        logo,
        codigoFormato: plantilla.codigo,
        versionFormato: plantilla.version,
        ...(verificacion ? { verificacion } : {}),
      });

    /**
     * El hash impreso NO puede ser el del PDF.
     *
     * Meterlo dentro del propio archivo cambia el archivo, y con él el hash:
     * es circular y no tiene solución. Lo que se imprime es el hash del
     * **contenido** —el HTML del informe sin el pie—, que es reproducible:
     * quien quiera comprobarlo vuelve a componer el mismo informe y le sale el
     * mismo número. El hash de los bytes del PDF, que es el que demuestra que
     * el archivo no se ha tocado, viaja en los metadatos de S3 y lo sirve la
     * API en la verificación.
     */
    const hashContenido = `sha256:${createHash('sha256').update(componer()).digest('hex')}`;

    const html = urlVerificacion
      ? componer({
          url: urlVerificacion,
          qr: await this.qr(urlVerificacion),
          hash: hashContenido,
        })
      : componer();

    const pdf = await this.renderer.generar(html);

    // El hash es lo que hace verificable un documento emitido: permite
    // demostrar que el PDF que tiene el cliente es el que salió de aquí.
    const hash = `sha256:${createHash('sha256').update(pdf).digest('hex')}`;
    // La clave la manda la API: tiene que ser la misma que ella use luego para
    // encontrar el documento, y derivarla dos veces por separado es pedir que un
    // día dejen de coincidir. La de aquí es solo el respaldo.
    const s3Key =
      job.data.s3Key ??
      `informes/${new Date().getFullYear()}/${informeId}/${informe.numeroInforme}.pdf`;

    if (this.s3 && this.bucket) {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: s3Key,
          Body: pdf,
          ContentType: 'application/pdf',
          Metadata: { informeid: informeId, hash },
        }),
      );
    } else {
      this.logger.warn(`Sin S3 configurado: el PDF de ${informe.numeroInforme} no se guardó.`);
    }

    const milisegundos = Date.now() - inicio;
    const fotos = informe.bloques.reduce((n, b) => n + (b.fotos?.length ?? 0), 0);

    // Se registra el tiempo con el número de fotos porque el criterio de F1 es
    // exactamente ese: 45 fotos en menos de 45 s (NFR-03). Sin la medida en el
    // log, la primera noticia de que se incumple llega por queja del técnico.
    this.logger.log(
      `PDF de ${informe.numeroInforme}: ${fotos} fotos, ${Math.round(pdf.length / 1024)} KB, ${milisegundos} ms.`,
    );

    return { informeId, tipo: 'pdf', s3Key, hash, bytes: pdf.length, milisegundos };
  }

  /**
   * El QR del pie, como SVG en `data:`.
   *
   * SVG y no PNG porque el documento se imprime: un QR rasterizado a 22 mm sale
   * con los módulos borrosos y hay escáneres que no lo leen. Corrección de
   * errores media: el pie de un informe de taller acaba con manchas.
   *
   * Si falla, el documento sale sin QR en vez de no salir. El PDF es lo que el
   * cliente espera; el código de verificación es una comodidad.
   */
  private async qr(url: string): Promise<string | undefined> {
    try {
      const svg = await qrToString(url, {
        type: 'svg',
        errorCorrectionLevel: 'M',
        margin: 0,
      });
      return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
    } catch (e: unknown) {
      this.logger.warn(`No se pudo generar el QR de verificación: ${String(e)}`);
      return undefined;
    }
  }
}

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Job } from 'bullmq';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import {
  renderReportHtml,
  type InformeRenderizable,
  type TemplateVersionDefinition,
} from '@dps/shared';
import { PdfRenderer } from './pdf.renderer';

export const COLA_DOCUMENTOS = 'documentos';

export interface TrabajoDePdf {
  readonly informeId: string;
  readonly informe: InformeRenderizable;
  readonly plantilla: TemplateVersionDefinition;
  /** `s3Key` → URL firmada de lectura, resueltas por la API antes de encolar. */
  readonly imagenes: Record<string, string>;
  readonly logo?: string;
}

export interface ResultadoDePdf {
  readonly s3Key: string;
  readonly hash: string;
  readonly bytes: number;
  readonly milisegundos: number;
}

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

  async process(job: Job<TrabajoDePdf>): Promise<ResultadoDePdf> {
    const inicio = Date.now();
    const { informeId, informe, plantilla, imagenes, logo } = job.data;

    const html = renderReportHtml(informe, plantilla, {
      // Las URLs firmadas las resuelve la API antes de encolar: el worker no
      // tiene por qué conocer las credenciales de lectura del bucket.
      resolverImagen: (clave) => imagenes[clave] ?? clave,
      logo,
      codigoFormato: plantilla.codigo,
      versionFormato: plantilla.version,
    });

    const pdf = await this.renderer.generar(html);

    // El hash es lo que hace verificable un documento emitido: permite
    // demostrar que el PDF que tiene el cliente es el que salió de aquí.
    const hash = `sha256:${createHash('sha256').update(pdf).digest('hex')}`;
    const s3Key = `informes/${new Date().getFullYear()}/${informeId}/${informe.numeroInforme}.pdf`;

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

    return { s3Key, hash, bytes: pdf.length, milisegundos };
  }
}

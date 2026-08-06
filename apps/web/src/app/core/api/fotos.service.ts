import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Lado mayor tras redimensionar. A 1600 px una foto llena una página A4 sobrada. */
export const LADO_MAXIMO = 1600;
/** Calidad JPEG. Por encima de 0.8 el archivo crece sin que se note en papel. */
export const CALIDAD = 0.8;

export interface SubidaPrefirmada {
  readonly url: string;
  readonly s3Key: string;
  readonly maxBytes: number;
}

/**
 * Subida de evidencia fotográfica (E1.6).
 *
 * La compresión ocurre **en el navegador**, antes de subir. Un móvil moderno
 * saca fotos de 12 MP y 5 MB; cuarenta y cinco de esas son 225 MB por informe,
 * que desde la conexión de un taller minero no se suben nunca. Reducidas a
 * 1600 px y calidad 80 quedan en unos 300 KB, y en papel se ven igual porque el
 * PDF no imprime a más resolución de la que caben en media página A4.
 */
@Injectable({ providedIn: 'root' })
export class FotosService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/media`;

  /**
   * Reduce y recodifica la imagen.
   *
   * Se usa `createImageBitmap` en vez de `<img>` porque no depende de que el
   * elemento esté en el documento y respeta la orientación EXIF: sin eso, las
   * fotos tomadas en vertical con el móvil salen giradas en el informe.
   */
  async comprimir(archivo: File): Promise<Blob> {
    const bitmap = await createImageBitmap(archivo, { imageOrientation: 'from-image' });

    const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
    const ancho = Math.round(bitmap.width * escala);
    const alto = Math.round(bitmap.height * escala);

    const lienzo = document.createElement('canvas');
    lienzo.width = ancho;
    lienzo.height = alto;

    const ctx = lienzo.getContext('2d');
    if (!ctx) throw new Error('El navegador no permite procesar la imagen.');
    ctx.drawImage(bitmap, 0, 0, ancho, alto);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      lienzo.toBlob(resolve, 'image/jpeg', CALIDAD),
    );
    if (!blob) throw new Error('No se pudo comprimir la fotografía.');
    return blob;
  }

  /**
   * Comprime y sube directamente a S3.
   *
   * El archivo no pasa por la API: con 45 fotos por informe, encaminarlas por
   * el servidor lo tumbaría con dos técnicos trabajando a la vez.
   */
  async subir(informeId: string, archivo: File): Promise<{ s3Key: string; bytes: number }> {
    const comprimida = await this.comprimir(archivo);

    const firma = await firstValueFrom(
      this.http.post<SubidaPrefirmada>(`${this.base}/informes/${informeId}/subida`, {
        tipo: 'image/jpeg',
      }),
    );

    if (comprimida.size > firma.maxBytes) {
      throw new Error('La fotografía sigue siendo demasiado grande tras comprimirla.');
    }

    // `fetch` y no `HttpClient`: el interceptor añadiría la cabecera de
    // autorización, y una petición firmada con cabeceras de más la rechaza S3.
    const respuesta = await fetch(firma.url, {
      method: 'PUT',
      body: comprimida,
      headers: { 'Content-Type': 'image/jpeg' },
    });

    if (!respuesta.ok) {
      throw new Error(`No se pudo subir la fotografía (${respuesta.status}).`);
    }

    return { s3Key: firma.s3Key, bytes: comprimida.size };
  }

  /** URLs temporales para pintar las fotos ya subidas. */
  async urlsDeLectura(claves: readonly string[]): Promise<Record<string, string>> {
    if (!claves.length) return {};
    return firstValueFrom(
      this.http.post<Record<string, string>>(`${this.base}/lectura`, { claves }),
    );
  }
}

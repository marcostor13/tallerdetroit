import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CALIDAD, FotosService, LADO_MAXIMO } from './fotos.service';

/**
 * Compresión y subida de fotografías (E1.6).
 *
 * Lo que se prueba es lo que hace viable el requisito: que la foto se reduzca
 * **antes** de salir del navegador. Un móvil saca 5 MB por foto y cuarenta y
 * cinco son 225 MB, que desde un taller minero no se suben nunca.
 */
describe('FotosService', () => {
  let servicio: FotosService;
  let http: { post: ReturnType<typeof vi.fn> };
  let dibujadas: { ancho: number; alto: number }[];
  let calidadUsada: number | undefined;
  let tipoUsado: string | undefined;

  /** Simula una imagen del tamaño indicado. */
  const conImagenDe = (width: number, height: number) => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width, height, close: vi.fn() }),
    );
  };

  beforeEach(() => {
    dibujadas = [];
    calidadUsada = undefined;
    tipoUsado = undefined;

    conImagenDe(4000, 3000);

    vi.spyOn(document, 'createElement').mockImplementation(((etiqueta: string) => {
      if (etiqueta !== 'canvas')
        return document.createElementNS('http://www.w3.org/1999/xhtml', etiqueta);
      const lienzo = {
        width: 0,
        height: 0,
        getContext: () => ({
          drawImage: (_img: unknown, _x: number, _y: number, ancho: number, alto: number) => {
            dibujadas.push({ ancho, alto });
          },
        }),
        toBlob: (cb: (b: Blob | null) => void, tipo: string, calidad: number) => {
          tipoUsado = tipo;
          calidadUsada = calidad;
          cb(new Blob([new Uint8Array(300 * 1024)], { type: tipo }));
        },
      };
      return lienzo as unknown as HTMLElement;
    }) as typeof document.createElement);

    http = { post: vi.fn() };

    TestBed.configureTestingModule({
      providers: [FotosService, { provide: HttpClient, useValue: http }],
    });
    servicio = TestBed.inject(FotosService);
  });

  afterEach(() => vi.restoreAllMocks());

  describe('compresión', () => {
    it('reduce el lado mayor a 1600 px conservando la proporción', async () => {
      await servicio.comprimir(new File([], 'foto.jpg'));

      // 4000×3000 → 1600×1200: media página A4 no da para más resolución.
      expect(dibujadas[0]).toEqual({ ancho: LADO_MAXIMO, alto: 1200 });
    });

    it('también funciona en vertical', async () => {
      conImagenDe(3000, 4000);
      await servicio.comprimir(new File([], 'foto.jpg'));
      expect(dibujadas[0]).toEqual({ ancho: 1200, alto: LADO_MAXIMO });
    });

    it('no agranda una foto que ya es pequeña', async () => {
      conImagenDe(800, 600);
      await servicio.comprimir(new File([], 'foto.jpg'));
      expect(dibujadas[0]).toEqual({ ancho: 800, alto: 600 });
    });

    it('recodifica a JPEG con la calidad acordada', async () => {
      await servicio.comprimir(new File([], 'foto.png'));
      expect(tipoUsado).toBe('image/jpeg');
      expect(calidadUsada).toBe(CALIDAD);
    });

    it('respeta la orientación EXIF', async () => {
      const crear = vi.fn().mockResolvedValue({ width: 100, height: 100, close: vi.fn() });
      vi.stubGlobal('createImageBitmap', crear);

      await servicio.comprimir(new File([], 'foto.jpg'));

      // Sin esto, las fotos tomadas en vertical con el móvil salen giradas.
      expect(crear).toHaveBeenCalledWith(expect.anything(), { imageOrientation: 'from-image' });
    });
  });

  describe('subida', () => {
    beforeEach(() => {
      http.post.mockReturnValue(
        of({
          url: 'https://s3/firmada',
          s3Key: 'informes/2026/r1/x.jpg',
          maxBytes: 8 * 1024 * 1024,
        }),
      );
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    });

    it('pide la firma al servidor y sube directamente a S3', async () => {
      const resultado = await servicio.subir('r1', new File([], 'foto.jpg'));

      expect(http.post).toHaveBeenCalledWith(expect.stringContaining('/media/informes/r1/subida'), {
        tipo: 'image/jpeg',
      });
      expect(resultado.s3Key).toBe('informes/2026/r1/x.jpg');
    });

    it('sube con fetch y no con HttpClient', async () => {
      await servicio.subir('r1', new File([], 'foto.jpg'));

      // El interceptor añadiría la cabecera de autorización, y S3 rechaza una
      // petición firmada que llega con cabeceras de más.
      const [url, opciones] = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock
        .calls[0] as [string, RequestInit];
      expect(url).toBe('https://s3/firmada');
      expect(opciones.method).toBe('PUT');
      expect(opciones.headers).toEqual({ 'Content-Type': 'image/jpeg' });
    });

    it('avisa si S3 rechaza la subida', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));
      await expect(servicio.subir('r1', new File([], 'foto.jpg'))).rejects.toThrow(/403/);
    });

    it('rechaza lo que sigue siendo demasiado grande tras comprimir', async () => {
      http.post.mockReturnValue(of({ url: 'https://s3/x', s3Key: 'k', maxBytes: 1024 }));
      await expect(servicio.subir('r1', new File([], 'foto.jpg'))).rejects.toThrow(/demasiado/i);
    });
  });

  describe('lectura', () => {
    it('no pregunta por una lista vacía', async () => {
      expect(await servicio.urlsDeLectura([])).toEqual({});
      expect(http.post).toHaveBeenCalledTimes(0);
    });

    it('pide las URLs firmadas de las claves', async () => {
      http.post.mockReturnValue(of({ k1: 'https://s3/k1' }));
      const urls = await servicio.urlsDeLectura(['k1']);

      expect(http.post).toHaveBeenCalledWith(expect.stringContaining('/media/lectura'), {
        claves: ['k1'],
      });
      expect(urls['k1']).toBe('https://s3/k1');
    });

    it('propaga el fallo para que el llamador decida', async () => {
      http.post.mockReturnValue(throwError(() => new Error('sin red')));
      await expect(servicio.urlsDeLectura(['k1'])).rejects.toThrow();
    });
  });
});

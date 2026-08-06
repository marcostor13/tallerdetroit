import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { chromium, type Browser } from 'playwright';

/**
 * Render de PDF con Chromium.
 *
 * El navegador se arranca **una vez** y se reutiliza. Levantar Chromium cuesta
 * entre uno y dos segundos; con el criterio de 45 fotos en menos de 45 s
 * (NFR-03), pagar ese arranque en cada informe es tirar el 4% del presupuesto de
 * tiempo antes de empezar a trabajar.
 *
 * Cada informe usa un contexto nuevo, que sí es barato: así una página que se
 * quede colgada no arrastra a la siguiente.
 */
@Injectable()
export class PdfRenderer implements OnModuleDestroy {
  private readonly logger = new Logger(PdfRenderer.name);
  private navegador: Browser | null = null;
  private arrancando: Promise<Browser> | null = null;

  /**
   * Tiempo máximo por informe.
   *
   * Se corta antes de que el trabajo de la cola se dé por perdido, para que el
   * error diga «tardó demasiado» en vez de dejar un proceso de Chromium
   * consumiendo memoria indefinidamente.
   */
  private static readonly TIEMPO_MAXIMO = 90_000;

  async generar(html: string): Promise<Buffer> {
    const navegador = await this.navegadorListo();
    const contexto = await navegador.newContext();

    try {
      const pagina = await contexto.newPage();
      await pagina.setContent(html, {
        // `networkidle` esperaría a que no haya peticiones durante 500 ms, y con
        // 45 imágenes eso puede no ocurrir nunca. Se espera a que cargue el DOM
        // y después, explícitamente, a las imágenes.
        waitUntil: 'domcontentloaded',
        timeout: PdfRenderer.TIEMPO_MAXIMO,
      });

      await this.esperarImagenes(pagina);

      return await pagina.pdf({
        format: 'A4',
        printBackground: true,
        // Los márgenes van en la hoja de estilos con `@page`, que es la misma
        // que usa la vista previa. Ponerlos aquí produciría un PDF con márgenes
        // distintos de los que el técnico vio en pantalla.
        preferCSSPageSize: true,
      });
    } finally {
      await contexto.close();
    }
  }

  /**
   * Espera a que todas las imágenes estén decodificadas.
   *
   * Sin esto salen recuadros en blanco: `domcontentloaded` no espera a las
   * imágenes, y un informe con las fotos vacías es peor que uno que tarda.
   */
  private async esperarImagenes(pagina: { evaluate: (fn: () => Promise<void>) => Promise<void> }) {
    await pagina.evaluate(async () => {
      const imagenes = Array.from(document.images);
      await Promise.all(
        imagenes.map((img) =>
          img.complete
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                // Una imagen que no carga no debe bloquear el documento entero:
                // se resuelve igual y sale el hueco, no un PDF que nunca llega.
                img.addEventListener('load', () => resolve(), { once: true });
                img.addEventListener('error', () => resolve(), { once: true });
              }),
        ),
      );
    });
  }

  private async navegadorListo(): Promise<Browser> {
    if (this.navegador?.isConnected()) return this.navegador;

    // Si llegan dos trabajos a la vez durante el arranque, comparten la misma
    // promesa en lugar de levantar dos Chromium.
    this.arrancando ??= chromium
      .launch({
        args: [
          // El contenedor no tiene espacio compartido suficiente para el
          // /dev/shm por defecto de Chromium, y sin esto revienta a mitad del
          // render de un informe con muchas fotos.
          '--disable-dev-shm-usage',
          '--no-sandbox',
        ],
      })
      .then((navegador) => {
        this.navegador = navegador;
        this.arrancando = null;
        this.logger.log('Chromium listo.');
        return navegador;
      })
      .catch((error: unknown) => {
        this.arrancando = null;
        throw error;
      });

    return this.arrancando;
  }

  async onModuleDestroy(): Promise<void> {
    await this.navegador?.close();
    this.navegador = null;
  }
}

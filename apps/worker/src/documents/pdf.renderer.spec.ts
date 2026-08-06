import {
  SER_FOR_002_V01,
  renderReportHtml,
  type BloqueRenderizable,
  type InformeRenderizable,
} from '@dps/shared';
import { PdfRenderer } from './pdf.renderer';

/**
 * Verificación de NFR-03: un informe con 45 fotografías genera su PDF en menos
 * de 45 segundos.
 *
 * Es el criterio de F1 que decide si el técnico espera o abandona, y el único
 * que se puede comprobar sin datos reales ni entorno desplegado. Se mide contra
 * el Chromium de verdad, no contra una simulación: el tiempo se lo lleva la
 * decodificación de las imágenes y el paginado, que es justo lo que una
 * simulación no reproduce.
 *
 * Las fotos son `data:` en vez de URLs firmadas para que la medida sea del
 * render y no de la red del que ejecuta los tests. Eso deja fuera el tiempo de
 * descarga, y por eso el presupuesto que se exige aquí es más estricto que el
 * del requisito.
 */
describe('PdfRenderer', () => {
  let renderer: PdfRenderer;

  /** Presupuesto propio del render, más estricto que los 45 s del requisito. */
  const PRESUPUESTO_MS = 30_000;

  /**
   * Fotografía sintética de 1600×1200, que es el tamaño al que el cliente
   * comprime antes de subir (E1.6).
   *
   * Se genera con el propio Chromium en vez de usar un PNG de 1×1: el tiempo de
   * este render se lo lleva decodificar las imágenes, y con un píxel el número
   * saldría precioso y no querría decir nada.
   */
  let FOTOS: string[] = [];

  /**
   * Cuarenta y cinco fotografías **distintas**.
   *
   * Que sean distintas no es un detalle: con la misma imagen repetida, el PDF
   * la embebe una sola vez y la referencia cuarenta y cinco veces, con lo que
   * la medida saldría diez veces mejor de lo que es en realidad. Un informe de
   * verdad trae cuarenta y cinco fotos diferentes.
   */
  const generarFotosDePrueba = async (cuantas: number): Promise<string[]> => {
    const { chromium } = await import('playwright');
    const navegador = await chromium.launch({ args: ['--disable-dev-shm-usage', '--no-sandbox'] });
    try {
      const pagina = await navegador.newPage();
      return await pagina.evaluate((n: number) => {
        const lienzo = document.createElement('canvas');
        lienzo.width = 1600;
        lienzo.height = 1200;
        const ctx = lienzo.getContext('2d');
        if (!ctx) throw new Error('sin canvas');

        const salida: string[] = [];
        for (let k = 0; k < n; k++) {
          // Ruido: una imagen plana se comprime a casi nada y volvería a
          // falsear la medida. La semilla cambia por foto.
          const datos = ctx.createImageData(1600, 1200);
          for (let i = 0; i < datos.data.length; i += 4) {
            const v = (i * 2654435761 + k * 7919) % 256;
            datos.data[i] = v;
            datos.data[i + 1] = (v * 3 + k) % 256;
            datos.data[i + 2] = (v * 7 + k * 5) % 256;
            datos.data[i + 3] = 255;
          }
          ctx.putImageData(datos, 0, 0);
          salida.push(lienzo.toDataURL('image/jpeg', 0.8));
        }
        return salida;
      }, cuantas);
    } finally {
      await navegador.close();
    }
  };

  const informeCon = (cuantasFotos: number): InformeRenderizable => {
    // Repartidas en bloques de tres, como en el OT-746: catorce trabajos con
    // dos o tres fotos cada uno, no una galería de cuarenta y cinco seguidas.
    const bloques: BloqueRenderizable[] = [];
    for (let i = 0; i < Math.ceil(cuantasFotos / 3); i++) {
      const fotos = Array.from({ length: Math.min(3, cuantasFotos - i * 3) }, (_, j) => ({
        id: `f${i}-${j}`,
        s3Key: FOTOS[(i * 3 + j) % FOTOS.length] as string,
        caption: `Detalle ${i * 3 + j + 1} del componente evaluado`,
      }));

      bloques.push({
        id: `b${i}`,
        clave: 'trabajos',
        tipo: 'work_task',
        orden: i + 1,
        titulo: `DESMONTAJE DE COMPONENTE ${i + 1}`,
        texto:
          'Se desmonta el componente y se verifica su estado. ' +
          'Se observan desgastes compatibles con las horas de servicio acumuladas.',
        veredicto: 'cambiar',
        fotos,
      });
    }

    return {
      numeroInforme: 'ITS-T-E-26-003-0746',
      numeroOt: 'LIM-TAL-000746',
      estado: 'emitido',
      fechaEmision: '2026-06-20T00:00:00.000Z',
      cliente: { nombre: 'SPCC. TOQUEPALA' },
      sede: { nombre: 'TALLER - LIMA' },
      equipo: { codigo: 'VQT-130', marca: 'KOMATSU', categoria: 'camion_minero' },
      motor: { serie: '5282011236', marca: 'MTU', modelo: '20V4000C23', cilindros: 20 },
      datos: {
        motivo: 'QL4 / W6-1',
        horasTotales: 17694,
        conclusiones: ['El motor requiere reparación mayor.'],
        recomendaciones: ['Cambiar los 20 pistones.'],
        tercerizados: [],
        mediciones: [],
      },
      bloques,
    };
  };

  const generar = async (fotos: number) => {
    const html = renderReportHtml(informeCon(fotos), SER_FOR_002_V01, {
      resolverImagen: (clave) => clave,
    });

    const inicio = Date.now();
    const pdf = await renderer.generar(html);
    return { pdf, ms: Date.now() - inicio };
  };

  beforeAll(async () => {
    renderer = new PdfRenderer();
    FOTOS = await generarFotosDePrueba(45);
    const kb = Math.round((FOTOS.reduce((n, f) => n + f.length, 0) * 3) / 4 / 1024);
    console.log(`${FOTOS.length} fotos distintas de 1600×1200, ${kb} KB en total.`);
  }, 300_000);

  afterAll(async () => {
    await renderer.onModuleDestroy();
  });

  it('genera un PDF válido de un informe sencillo', async () => {
    const { pdf } = await generar(2);

    expect(pdf.length).toBeGreaterThan(1_000);
    // Firma de un PDF: si esto falla, lo que sale no lo abre ningún visor.
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  }, 120_000);

  it('45 fotografías en menos de 45 s (NFR-03)', async () => {
    const { pdf, ms } = await generar(45);

    console.log(`NFR-03: 45 fotos renderizadas en ${ms} ms (${Math.round(pdf.length / 1024)} KB).`);

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(ms).toBeLessThan(PRESUPUESTO_MS);
  }, 180_000);

  it('reutiliza el navegador entre informes', async () => {
    // Levantar Chromium cuesta 1-2 s. Pagarlo en cada informe se lleva el 4%
    // del presupuesto de NFR-03 antes de empezar a trabajar.
    const primero = await generar(2);
    const segundo = await generar(2);

    expect(segundo.ms).toBeLessThanOrEqual(primero.ms + 2_000);
  }, 120_000);

  it('una imagen que no carga no deja el PDF sin generar', async () => {
    const informe = informeCon(2);
    const roto: InformeRenderizable = {
      ...informe,
      bloques: informe.bloques.map((b) => ({
        ...b,
        fotos: (b.fotos ?? []).map((f) => ({ ...f, s3Key: 'https://no-existe.invalid/foto.jpg' })),
      })),
    };

    const html = renderReportHtml(roto, SER_FOR_002_V01, { resolverImagen: (c) => c });
    const pdf = await renderer.generar(html);

    // Sale el hueco, no un documento que nunca llega.
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  }, 120_000);
});

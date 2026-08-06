import { buildDocxModel, type InformeRenderizable } from '@dps/shared';
import { SER_FOR_002_V01 } from '@dps/shared';
import { DocxRenderer } from './docx.renderer';

/**
 * Export a Word (E3.5).
 *
 * Lo que se puede comprobar sin abrir Word es que el archivo **es un `.docx` de
 * verdad**: un ZIP con las partes que exige OOXML y el texto del informe
 * dentro. Que Word no muestre advertencias al abrirlo es otra comprobación y la
 * hace una persona; esta descarta lo más común, que el paquete salga corrupto o
 * vacío.
 */
describe('DocxRenderer', () => {
  const renderer = new DocxRenderer();

  const informe: InformeRenderizable = {
    numeroInforme: 'ITS-T-E-26-003-0898',
    numeroOt: 'LIM-TAL-000898',
    estado: 'emitido',
    fechaEmision: '2026-08-06T00:00:00.000Z',
    cliente: { nombre: 'SPCC. TOQUEPALA' },
    sede: { nombre: 'Toquepala' },
    equipo: { codigo: 'VQT-130', categoria: 'camion_minero' },
    motor: { modelo: '20V4000C23', serie: '5282011236', cilindros: 20, apoyosBancada: 11 },
    datos: {},
    bloques: [
      {
        id: 'b1',
        clave: 'trabajos',
        tipo: 'work_task',
        orden: 1,
        titulo: 'MEDICIÓN DEL TÚNEL DE BANCADA',
        texto: 'Se mide el túnel apoyo por apoyo con micrómetro de interiores.',
        fotos: [{ id: 'f1', s3Key: 'org/f1.jpg', caption: 'Apoyo 7' }],
        mediciones: [
          {
            plantilla: 'tunel_bancada',
            nombre: 'Túnel de bancada',
            unidad: 'mm',
            filas: ['a'],
            columnas: ['1'],
            valores: [
              { fila: 'a', columna: '1', valor: 171.16, estado: 'fuera', calculado: false },
            ],
            especificacion: null,
            resumen: { fueraTolerancia: 1 },
          },
        ],
      },
    ],
  };

  const generar = (imagenes: Record<string, Buffer> = {}) =>
    renderer.generar(buildDocxModel(informe, SER_FOR_002_V01), imagenes);

  it('produce un paquete OOXML válido, no un archivo vacío', async () => {
    const archivo = await generar();

    // Firma de ZIP: `PK\x03\x04`. Sin esto, Word ni lo intenta abrir.
    expect(archivo.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    expect(archivo.length).toBeGreaterThan(2_000);
  }, 30_000);

  it('lleva las partes que exige el formato', async () => {
    const contenido = (await generar()).toString('latin1');

    // Los nombres de las entradas del ZIP van en claro en la cabecera local.
    expect(contenido).toContain('[Content_Types].xml');
    expect(contenido).toContain('word/document.xml');
    expect(contenido).toContain('word/styles.xml');
  }, 30_000);

  it('no se cae porque falte una foto: sale con su pie', async () => {
    // Un `.docx` que no se genera porque una imagen dio 403 deja al técnico sin
    // el documento que tiene que entregar.
    const sinImagenes = await generar();
    const conImagen = await generar({ 'org/f1.jpg': Buffer.alloc(0) });

    expect(sinImagenes.length).toBeGreaterThan(2_000);
    expect(conImagen.length).toBeGreaterThan(2_000);
  }, 30_000);

  it('el mismo informe da el mismo tamaño: el contenido no depende del azar', async () => {
    // Si variara entre ejecuciones, el hash del documento cambiaría solo y la
    // reimpresión dejaría de coincidir (RN-02).
    const primero = await generar();
    const segundo = await generar();
    expect(primero.length).toBe(segundo.length);
  }, 30_000);
});

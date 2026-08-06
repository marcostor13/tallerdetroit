import { describe, expect, it } from 'vitest';
import { SER_FOR_002_V01 } from '../domain/ser-for-002';
import { buildDocxModel, type ElementoDocx, type TablaDocx } from './report-docx-model';
import type { InformeRenderizable } from './report-html';

const informe: InformeRenderizable = {
  numeroInforme: 'ITS-T-E-26-003-0898',
  numeroOt: 'LIM-TAL-000898',
  estado: 'emitido',
  fechaEmision: '2026-08-06T00:00:00.000Z',
  cliente: { nombre: 'SPCC. TOQUEPALA' },
  sede: { nombre: 'Toquepala' },
  equipo: { codigo: 'VQT-130', categoria: 'camion_minero' },
  motor: { modelo: '20V4000C23', serie: '5282011236', cilindros: 20, apoyosBancada: 11 },
  datos: { antecedentes: 'Motor desmontado del camión VQT-130.' },
  bloques: [
    {
      id: 'b1',
      clave: 'trabajos',
      tipo: 'work_task',
      orden: 1,
      titulo: 'MEDICIÓN DEL TÚNEL DE BANCADA',
      texto: 'Se mide el túnel apoyo por apoyo.',
      veredicto: 'reparar',
      fotos: [{ id: 'f1', s3Key: 'org/f1.jpg', caption: 'Apoyo 7' }],
      mediciones: [
        {
          plantilla: 'tunel_bancada',
          nombre: 'Túnel de bancada',
          unidad: 'mm',
          filas: ['a'],
          columnas: ['1', '2'],
          valores: [
            { fila: 'a', columna: '1', valor: 171.01, estado: 'ok', calculado: false },
            { fila: 'a', columna: '2', valor: 171.16, estado: 'fuera', calculado: false },
          ],
          especificacion: {
            nominal: 171,
            tolInf: 0,
            tolSup: 0.025,
            unidad: 'mm',
            fuente: 'Informe OT898',
            provisional: true,
          },
          resumen: { fueraTolerancia: 1 },
          justificacion: 'Se rectifica el apoyo antes del montaje.',
        },
      ],
    },
  ],
};

const construir = (extra: Partial<InformeRenderizable> = {}) =>
  buildDocxModel({ ...informe, ...extra }, SER_FOR_002_V01);

const textos = (elementos: readonly ElementoDocx[]): string[] =>
  elementos.filter((e) => e.tipo === 'parrafo').map((e) => e.texto);

const tablas = (elementos: readonly ElementoDocx[]): TablaDocx[] =>
  elementos.filter((e): e is TablaDocx => e.tipo === 'tabla');

/**
 * Modelo del export a Word (E3.5).
 *
 * Lo que decide si el `.docx` sirve es que lleve todas las secciones, en su
 * orden, con sus tablas y sus pies de figura. Eso se prueba aquí; que Word no
 * se queje al abrirlo es otra comprobación, y la hace una persona.
 */
describe('Modelo del documento Word', () => {
  it('sale de la misma plantilla que el PDF, con sus numerales', () => {
    const doc = construir();
    const titulos = textos(doc.elementos);

    expect(doc.codigoFormato).toBe('SER-FOR-002');
    expect(titulos).toContain('I. Datos generales');
    expect(titulos.some((t) => t.includes('Trabajos realizados'))).toBe(true);
  });

  it('respeta el orden de las secciones de la plantilla', () => {
    const titulos = textos(construir().elementos).filter((t) => /^[IVX]+\. /.test(t));
    const ordenados = [...titulos];
    // Los numerales romanos crecen; si el modelo los sacara desordenados, el
    // Word tendría los epígrafes mezclados respecto al PDF.
    expect(titulos).toEqual(ordenados);
    expect(titulos.length).toBeGreaterThan(1);
  });

  it('una sección sin contenido no sale: un Word con epígrafes vacíos parece a medias', () => {
    const titulos = textos(construir().elementos);
    // El informe de prueba no tiene tercerizados, así que esa sección no debe
    // aparecer aunque esté en la plantilla.
    expect(titulos.some((t) => t.includes('tercerizados'))).toBe(false);
  });

  describe('tablas dimensionales', () => {
    it('llevan la unidad y las columnas resueltas del motor', () => {
      const tabla = tablas(construir().elementos).find((t) => t.monoespaciada);
      expect(tabla?.filas[0]).toEqual(['mm', '1', '2']);
      expect(tabla?.filas[1]).toEqual(['a', '171.010', '171.160']);
    });

    it('lo que está fuera de tolerancia se marca para ir en negrita', () => {
      // No basta el color: el informe se fotocopia en blanco y negro y ahí el
      // color no existe (§8 del sistema de diseño).
      const tabla = tablas(construir().elementos).find((t) => t.monoespaciada);
      expect(tabla?.destacadas).toEqual(['a|2']);
    });

    it('la tolerancia aplicada se escribe, con su marca de provisional', () => {
      const lineas = textos(construir().elementos);
      expect(lineas.some((l) => l.includes('Nominal 171 mm') && l.includes('Provisional'))).toBe(
        true,
      );
    });

    it('la justificación va pegada a su tabla, no al final del informe', () => {
      const elementos = construir().elementos;
      const indiceTabla = elementos.findIndex((e) => e.tipo === 'tabla' && e.monoespaciada);
      const indiceJustificacion = elementos.findIndex(
        (e) => e.tipo === 'parrafo' && e.texto.startsWith('Justificación:'),
      );

      expect(indiceJustificacion).toBeGreaterThan(indiceTabla);
      expect(indiceJustificacion - indiceTabla).toBe(1);
    });
  });

  describe('figuras', () => {
    it('llevan el número calculado desde el orden, no uno propio del Word', () => {
      const figura = construir().elementos.find((e) => e.tipo === 'figura');
      expect(figura).toMatchObject({ s3Key: 'org/f1.jpg', numero: 1, pie: 'Apoyo 7' });
    });

    it('van después del texto del bloque, no antes', () => {
      const elementos = construir().elementos;
      const indiceTexto = elementos.findIndex(
        (e) => e.tipo === 'parrafo' && e.texto.includes('apoyo por apoyo'),
      );
      const indiceFigura = elementos.findIndex((e) => e.tipo === 'figura');
      expect(indiceFigura).toBeGreaterThan(indiceTexto);
    });
  });

  describe('inventario de desarmado', () => {
    it('un ítem sin revisar sale escrito, no en blanco', () => {
      const doc = construir({
        bloques: [
          {
            id: 'b9',
            clave: 'inventario-desarmado',
            tipo: 'checklist',
            orden: 1,
            titulo: 'Inventario',
            checklist: {
              items: [
                { clave: 'piston', denominacion: 'Pistones', cantidadDerivadaDe: 'cilindros' },
              ],
              capturado: [],
            },
          },
        ],
      });

      const tabla = tablas(doc.elementos).find((t) => t.filas[0]?.includes('Denominación'));
      expect(tabla?.filas[1]).toEqual(['Pistones', 'Sin revisar', '', '20', '']);
    });

    it('lo que requiere atención se marca', () => {
      const doc = construir({
        bloques: [
          {
            id: 'b9',
            clave: 'inventario-desarmado',
            tipo: 'checklist',
            orden: 1,
            titulo: 'Inventario',
            checklist: {
              items: [{ clave: 'volante', denominacion: 'Volante', cantidadEsperada: 1 }],
              capturado: [{ clave: 'volante', estado: 'falta' }],
            },
          },
        ],
      });

      const tabla = tablas(doc.elementos).find((t) => t.filas[0]?.includes('Denominación'));
      expect(tabla?.destacadas).toContain('Volante|Estado');
    });
  });

  describe('datos generales', () => {
    it('salen aunque no exista el bloque en el informe: se leen de la cabecera', () => {
      const tabla = tablas(construir().elementos).find((t) =>
        t.filas.some((f) => f[0] === 'N° de informe'),
      );
      expect(tabla?.filas).toContainEqual(['N° de informe', 'ITS-T-E-26-003-0898']);
      expect(tabla?.filas).toContainEqual(['Cliente', 'SPCC. TOQUEPALA']);
    });

    it('un campo vacío sale como raya, no como «undefined»', () => {
      const doc = construir({ numeroOt: null, sede: {} });
      const plano = JSON.stringify(doc.elementos);

      expect(plano).not.toContain('undefined');
      expect(plano).not.toContain('null');
    });
  });
});

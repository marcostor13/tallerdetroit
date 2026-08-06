import { Injectable, Logger } from '@nestjs/common';
import {
  AlignmentType,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import type { DocumentoDocx, ElementoDocx, TablaDocx } from '@dps/shared';

/** Milímetros a twips (1/1440 pulgada), que es lo que entiende OOXML. */
const mm = (valor: number) => Math.round((valor / 25.4) * 1440);

/** Las tres del sistema de diseño (§4), tal como se llaman en Word. */
const TITULARES = 'Montserrat';
const CUERPO = 'Hanken Grotesk';
const DATOS = 'JetBrains Mono';

/**
 * Export a Word del informe (E3.5).
 *
 * Se construye el `.docx` programáticamente en vez de rellenar una plantilla
 * `.dotx` con docxtemplater. El motivo es concreto: la estructura del informe
 * **no es fija**. Calidad publica versiones con secciones distintas (E3.7) y un
 * informe tiene entre dos y catorce bloques de trabajo, cada uno con sus tablas
 * y sus fotos. Una plantilla de marcadores obligaría a republicarla cada vez que
 * cambia el formato, que es justo lo que el motor de plantillas viene a evitar.
 *
 * Lo que se pierde —que Calidad edite el aspecto sin tocar código— se recupera
 * en el `.docx` mismo: sale con estilos de Word de verdad, así que quien lo abre
 * puede cambiar «Título 1» y se le aplica a todo el documento.
 */
@Injectable()
export class DocxRenderer {
  private readonly logger = new Logger(DocxRenderer.name);

  /**
   * Arma el archivo.
   *
   * `imagenes` trae las fotos ya descargadas por clave de S3. Las que falten se
   * omiten con su pie: un informe sin una foto sigue sirviendo; uno que no se
   * genera porque una imagen dio error, no.
   */
  async generar(documento: DocumentoDocx, imagenes: Record<string, Buffer> = {}): Promise<Buffer> {
    const hijos = documento.elementos.flatMap((elemento) => this.componer(elemento, imagenes));

    const doc = new Document({
      creator: 'Detroit Power System Perú',
      title: documento.numeroInforme,
      description: `${documento.codigoFormato} ${documento.versionFormato}`,
      styles: { default: { document: { run: { font: CUERPO, size: 22 } } } },
      sections: [
        {
          properties: {
            page: {
              // A4 con márgenes de 25 mm, como el PDF (§8 del sistema de diseño).
              margin: { top: mm(25), bottom: mm(25), left: mm(25), right: mm(25) },
            },
          },
          children: hijos,
        },
      ],
    });

    return Packer.toBuffer(doc);
  }

  private componer(
    elemento: ElementoDocx,
    imagenes: Record<string, Buffer>,
  ): (Paragraph | Table)[] {
    if (elemento.tipo === 'tabla') return [this.tabla(elemento)];
    if (elemento.tipo === 'figura') return this.figura(elemento, imagenes);

    switch (elemento.estilo) {
      case 'titulo1':
        return [
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 240, after: 120 },
            children: [
              new TextRun({ text: elemento.texto.toUpperCase(), font: TITULARES, bold: true }),
            ],
          }),
        ];

      case 'titulo2':
        return [
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 180, after: 80 },
            children: [new TextRun({ text: elemento.texto, font: TITULARES, bold: true })],
          }),
        ];

      case 'titulo3':
        return [
          new Paragraph({
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 120, after: 60 },
            children: [new TextRun({ text: elemento.texto, font: TITULARES })],
          }),
        ];

      case 'vineta':
        return [new Paragraph({ text: elemento.texto, bullet: { level: 0 } })];

      case 'pie':
        return [
          new Paragraph({
            spacing: { after: 60 },
            children: [
              new TextRun({ text: elemento.texto, font: DATOS, size: 16, color: '5F5E5E' }),
            ],
          }),
        ];

      default:
        return [
          new Paragraph({
            // Justificado, que es como sale el Word original.
            alignment: AlignmentType.JUSTIFIED,
            spacing: { after: 120 },
            children: [new TextRun({ text: elemento.texto })],
          }),
        ];
    }
  }

  private tabla(tabla: TablaDocx): Table {
    const destacadas = new Set(tabla.destacadas ?? []);
    const fuente = tabla.monoespaciada ? DATOS : CUERPO;

    const filas = tabla.filas.map((celdas, indiceFila) => {
      const esCabecera = tabla.conCabecera && indiceFila === 0;

      return new TableRow({
        tableHeader: esCabecera,
        children: celdas.map((celda, indiceColumna) => {
          // La clave de «destacada» es `fila|columna` con sus rótulos, no con
          // sus índices: así el modelo no depende de dónde acabe cada columna.
          const clave = `${celdas[0] ?? ''}|${tabla.filas[0]?.[indiceColumna] ?? ''}`;
          const fuera = destacadas.has(clave);

          return new TableCell({
            shading: esCabecera ? { fill: 'F3F3F3' } : undefined,
            children: [
              new Paragraph({
                alignment:
                  indiceColumna > 0 && tabla.monoespaciada ? AlignmentType.RIGHT : undefined,
                children: [
                  new TextRun({
                    text: celda,
                    font: fuente,
                    size: tabla.monoespaciada ? 18 : 20,
                    // Fuera de tolerancia en negrita además de en color: el
                    // informe se fotocopia en blanco y negro.
                    bold: esCabecera || fuera,
                  }),
                ],
              }),
            ],
          });
        }),
      });
    });

    return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: filas });
  }

  private figura(
    figura: Extract<ElementoDocx, { tipo: 'figura' }>,
    imagenes: Record<string, Buffer>,
  ): Paragraph[] {
    const rotulo = figura.numero
      ? `Fig.${String(figura.numero).padStart(2, '0')} — ${figura.pie}`
      : figura.pie;

    const datos = imagenes[figura.s3Key];
    if (!datos) {
      this.logger.warn(`Sin imagen para ${figura.s3Key}: sale solo el pie.`);
      return [this.pieDeFigura(rotulo)];
    }

    return [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new ImageRun({
            type: 'jpg',
            data: datos,
            // 80 × 60 mm: dos por fila en el Word original.
            transformation: { width: 302, height: 227 },
          }),
        ],
      }),
      this.pieDeFigura(rotulo),
    ];
  }

  private pieDeFigura(rotulo: string): Paragraph {
    return new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [new TextRun({ text: rotulo, font: DATOS, size: 16, italics: true })],
    });
  }
}

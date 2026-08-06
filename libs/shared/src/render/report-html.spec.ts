import { describe, expect, it } from 'vitest';
import { SER_FOR_002_V01 } from '../domain/ser-for-002';
import { escapeHtml, renderReportHtml, type InformeRenderizable } from './report-html';

/** Informe parecido al OT-746: motor MTU de camión minero con dos trabajos. */
const informe: InformeRenderizable = {
  numeroInforme: 'ITS-T-E-26-003-0746',
  numeroOt: 'LIM-TAL-000746',
  estado: 'emitido',
  fechaEmision: '2026-06-20T00:00:00.000Z',
  cliente: { nombre: 'SPCC. TOQUEPALA' },
  sede: { nombre: 'TALLER - LIMA' },
  equipo: { codigo: 'VQT-130', marca: 'KOMATSU', modelo: '930E4-SE', categoria: 'camion_minero' },
  motor: { serie: '5282011236', marca: 'MTU', modelo: '20V4000C23', cilindros: 20 },
  datos: {
    motivo: 'QL4 / W6-1',
    horasTotales: 17694,
    antecedentes: 'Motor desmontado del camión VQT-130.',
    conclusiones: ['El motor requiere reparación mayor.'],
    tercerizados: [],
    mediciones: [],
  },
  bloques: [
    {
      id: 'b1',
      clave: 'trabajos',
      tipo: 'work_task',
      orden: 1,
      titulo: 'DESMONTAJE DE CULATAS',
      texto: 'Se desmontan las culatas.',
      veredicto: 'cambiar',
      fotos: [
        { id: 'f1', s3Key: 'org/f1.jpg', caption: 'Culata desgastada' },
        { id: 'f2', s3Key: 'org/f2.jpg', caption: 'Asiento de válvula' },
      ],
    },
    {
      id: 'b2',
      clave: 'trabajos',
      tipo: 'work_task',
      orden: 2,
      titulo: 'DESMONTAJE DE PISTONES',
      texto: 'Se desmontan los pistones.',
      fotos: [{ id: 'f3', s3Key: 'org/f3.jpg', caption: 'Falda del pistón' }],
    },
    {
      id: 'b3',
      clave: 'antecedentes',
      tipo: 'rich_text',
      orden: 3,
      titulo: 'Antecedentes',
      texto: 'Motor desmontado del camión VQT-130.',
    },
  ],
};

const render = (extra: Partial<InformeRenderizable> = {}) =>
  renderReportHtml({ ...informe, ...extra }, SER_FOR_002_V01, {
    resolverImagen: (clave) => `https://cdn.ejemplo/${clave}`,
  });

describe('Render del informe', () => {
  it('produce un documento completo con su hoja de estilos embebida', () => {
    const html = render();
    expect(html).toContain('<!doctype html>');
    // Va embebida y no como <link>: ni el taller sin red ni Chromium en el
    // contenedor pueden depender de que llegue una petición externa.
    expect(html).toContain('<style>');
    expect(html).toContain('@page');
  });

  it('replica la cabecera del formato controlado', () => {
    const html = render();
    expect(html).toContain('SER-FOR-002');
    expect(html).toContain('ITS-T-E-26-003-0746');
    expect(html).toContain('Informe técnico de evaluación');
  });

  it('saca las tablas de datos generales y de equipo', () => {
    const html = render();
    for (const dato of [
      'SPCC. TOQUEPALA',
      'TALLER - LIMA',
      'VQT-130',
      '5282011236',
      '20V4000C23',
    ]) {
      expect(html).toContain(dato);
    }
  });

  it('numera las figuras correlativamente en todo el documento', () => {
    const html = render();
    expect(html).toContain('Fig.01');
    expect(html).toContain('Fig.02');
    expect(html).toContain('Fig.03');
  });

  it('la numeración impresa es la misma que la de pantalla (RN-06)', () => {
    // Se invierte el orden de los bloques: la foto del segundo pasa a ser la
    // primera figura, sin que nadie reescriba ningún número.
    const invertido = render({
      bloques: informe.bloques.map((b) =>
        b.id === 'b1' ? { ...b, orden: 2 } : b.id === 'b2' ? { ...b, orden: 1 } : b,
      ),
    });

    // Cada pie lleva su etiqueta delante: se extraen los pares y se comprueba
    // a qué foto le tocó cada número.
    const numeroDe = (html: string): Record<string, string> =>
      Object.fromEntries(
        [
          ...html.matchAll(
            /<span class="foto__numero">(Fig\.\d+)<\/span>\s*([^<]*)<\/figcaption>/g,
          ),
        ].map((m) => [(m[2] ?? '').trim(), m[1] ?? '']),
      );

    expect(numeroDe(render())['Falda del pistón']).toBe('Fig.03');
    expect(numeroDe(invertido)['Falda del pistón']).toBe('Fig.01');
    expect(numeroDe(invertido)['Culata desgastada']).toBe('Fig.02');
  });

  it('las fotos van en pares y cada una con su pie', () => {
    const html = render();
    expect(html).toContain('class="fotos"');
    expect(html).toContain('Culata desgastada');
    expect(html).toContain('https://cdn.ejemplo/org/f1.jpg');
    // El pie es también el texto alternativo: una figura sin alt deja fuera a
    // quien lee el PDF con lector de pantalla.
    expect(html).toContain('alt="Culata desgastada"');
  });

  it('las reglas de paginación evitan los cortes que estropean el Word', () => {
    const html = render();
    // Título separado de su contenido, foto separada de su pie y tabla partida
    // por la mitad son los tres defectos visibles del formato actual.
    expect(html).toContain('break-after: avoid');
    expect(html).toContain('break-inside: avoid');
  });

  it('un borrador sale marcado como tal', () => {
    // Un borrador impreso sin distintivo se confunde con el documento emitido.
    expect(render({ estado: 'borrador' })).toContain('borrador');
    expect(render({ estado: 'emitido' })).not.toContain('class="hoja borrador"');
  });

  it('aplica las reglas de visibilidad: sin tercerizados no sale esa sección', () => {
    expect(render()).not.toContain('Componentes tercerizados');

    const conTercerizados = render({
      datos: { ...informe.datos, tercerizados: [{ descripcion: 'Rectificado de cigüeñal' }] },
      bloques: [
        ...informe.bloques,
        {
          id: 'b4',
          clave: 'tercerizados',
          tipo: 'items_table',
          orden: 4,
          titulo: 'Componentes enviados a terceros',
          datos: [{ descripcion: 'Rectificado de cigüeñal', proveedor: 'RECTIFICADORA SAC' }],
        },
      ],
    });
    expect(conTercerizados).toContain('Componentes tercerizados');
    expect(conTercerizados).toContain('RECTIFICADORA SAC');
  });

  it('repite el bloque de trabajo tantas veces como instancias haya', () => {
    const html = render();
    expect(html).toContain('DESMONTAJE DE CULATAS');
    expect(html).toContain('DESMONTAJE DE PISTONES');
  });

  it('una sección sin contenido no deja un título huérfano', () => {
    const html = render({ bloques: [], datos: { tercerizados: [], mediciones: [] } });
    expect(html).not.toContain('Trabajos realizados');
  });

  it('escapa lo que escribe el usuario', () => {
    // El texto del informe lo teclea una persona y acaba en un documento que
    // se abre en un navegador.
    const html = render({
      bloques: [
        {
          id: 'x',
          clave: 'antecedentes',
          tipo: 'rich_text',
          orden: 1,
          texto: '<script>alert(1)</script>',
        },
      ],
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('devuelve solo el cuerpo cuando se va a incrustar', () => {
    const cuerpo = renderReportHtml(informe, SER_FOR_002_V01, { documentoCompleto: false });
    expect(cuerpo).not.toContain('<!doctype html>');
    expect(cuerpo).toContain('class="hoja');
  });

  describe('escapeHtml', () => {
    it('cubre los cinco caracteres que importan', () => {
      expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
        '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
      );
    });

    it('nulos y indefinidos salen vacíos, no como texto «null»', () => {
      expect(escapeHtml(null)).toBe('');
      expect(escapeHtml(undefined)).toBe('');
    });
  });
});

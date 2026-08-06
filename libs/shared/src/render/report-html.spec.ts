import { describe, expect, it } from 'vitest';
import { SER_FOR_002_V01 } from '../domain/ser-for-002';
import {
  escapeHtml,
  renderMeasurementSheet,
  renderReportHtml,
  type InformeRenderizable,
} from './report-html';
import { REPORT_STYLES } from './report-styles';

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

/**
 * Los dos informes reales, compuestos desde LA MISMA plantilla.
 *
 * Es el criterio que decide si el motor de plantillas sirve: el OT-746 es un
 * W6-1 con seguidores y varillas, y el ITS-T-E-26-898 es un QL4 con turbos,
 * housing posterior y componentes tercerizados. Salen documentos distintos sin
 * tocar una línea de código, solo eligiendo bloques y rellenando datos.
 *
 * La comparación ciega contra el Word la hace un supervisor; lo que se prueba
 * aquí es lo que se puede probar sin él: que no hace falta programar nada para
 * el segundo informe.
 */
describe('Los dos informes reales desde la misma plantilla', () => {
  const trabajo = (id: string, orden: number, titulo: string, fotos: number) => ({
    id,
    clave: 'trabajos',
    tipo: 'work_task',
    orden,
    titulo,
    texto: `Se ejecuta ${titulo.toLowerCase()} y se verifica el estado del componente.`,
    veredicto: 'cambiar',
    fotos: Array.from({ length: fotos }, (_, i) => ({
      id: `${id}-f${i}`,
      s3Key: `org/${id}-${i}.jpg`,
      caption: `Detalle ${i + 1} de ${titulo.toLowerCase()}`,
    })),
  });

  /** OT-746: motor MTU 20V del camión VQT-130, intervención W6-1. */
  const ot746: InformeRenderizable = {
    numeroInforme: 'ITS-T-E-26-003-0746',
    numeroOt: 'LIM-TAL-000746',
    estado: 'emitido',
    fechaEmision: '2026-06-20T00:00:00.000Z',
    cliente: { nombre: 'SPCC. TOQUEPALA' },
    sede: { nombre: 'TALLER - LIMA' },
    equipo: { codigo: 'VQT-130', marca: 'KOMATSU', modelo: '930E4-SE', categoria: 'camion_minero' },
    motor: { serie: '5282011236', marca: 'MTU', modelo: '20V4000C23', cilindros: 20 },
    datos: {
      motivo: 'W6-1',
      horasTotales: 17694,
      intervencion: { codigo: 'W6-1' },
      conclusiones: ['Los seguidores presentan desgaste en la pista de rodadura.'],
      tercerizados: [],
      mediciones: [],
    },
    bloques: [
      trabajo('t1', 1, 'DESMONTAJE DE SEGUIDORES', 2),
      trabajo('t2', 2, 'DESMONTAJE DE VARILLAS DE EMPUJE', 2),
      trabajo('t3', 3, 'DESMONTAJE DE CULATAS', 3),
    ],
  };

  /** ITS-T-E-26-898: motor 16V de Toquepala, QL4, con componentes a terceros. */
  const ot898: InformeRenderizable = {
    numeroInforme: 'ITS-T-E-26-003-0898',
    numeroOt: 'LIM-TAL-000898',
    estado: 'emitido',
    fechaEmision: '2026-07-15T00:00:00.000Z',
    cliente: { nombre: 'SPCC. TOQUEPALA' },
    sede: { nombre: 'TALLER - LIMA' },
    equipo: { codigo: 'VQT-131', marca: 'KOMATSU', modelo: '930E4-SE', categoria: 'camion_minero' },
    motor: { serie: '5272012973', marca: 'MTU', modelo: '16V4000C21', cilindros: 16 },
    datos: {
      motivo: 'QL4',
      horasTotales: 21340,
      intervencion: { codigo: 'QL4' },
      conclusiones: ['El cigüeñal requiere rectificado en taller externo.'],
      tercerizados: [{ descripcion: 'Rectificado de cigüeñal' }],
      mediciones: [],
    },
    bloques: [
      trabajo('u1', 1, 'DESMONTAJE DE TURBOS', 3),
      trabajo('u2', 2, 'DESMONTAJE DE HOUSING POSTERIOR', 2),
      {
        id: 'u3',
        clave: 'tercerizados',
        tipo: 'items_table',
        orden: 3,
        titulo: 'Componentes enviados a terceros',
        datos: [{ descripcion: 'Rectificado de cigüeñal', proveedor: 'RECTIFICADORA SAC' }],
      },
    ],
  };

  const render746 = renderReportHtml(ot746, SER_FOR_002_V01, { resolverImagen: (c) => c });
  const render898 = renderReportHtml(ot898, SER_FOR_002_V01, { resolverImagen: (c) => c });

  it('la plantilla es exactamente la misma para los dos', () => {
    // Si hiciera falta una plantilla por informe, no habría motor de plantillas
    // sino dos formularios escritos a mano.
    expect(SER_FOR_002_V01.codigo).toBe('SER-FOR-002');
    expect(render746).toContain('SER-FOR-002');
    expect(render898).toContain('SER-FOR-002');
  });

  it('cada uno saca sus propios trabajos', () => {
    expect(render746).toContain('DESMONTAJE DE SEGUIDORES');
    expect(render746).toContain('DESMONTAJE DE VARILLAS DE EMPUJE');
    expect(render746).not.toContain('DESMONTAJE DE TURBOS');

    expect(render898).toContain('DESMONTAJE DE TURBOS');
    expect(render898).toContain('DESMONTAJE DE HOUSING POSTERIOR');
    expect(render898).not.toContain('DESMONTAJE DE SEGUIDORES');
  });

  it('la sección de tercerizados solo aparece en el que los tiene', () => {
    expect(render746).not.toContain('Componentes tercerizados');
    expect(render898).toContain('Componentes tercerizados');
    expect(render898).toContain('RECTIFICADORA SAC');
  });

  it('los datos del motor salen del propio informe, no de la plantilla', () => {
    expect(render746).toContain('20V4000C23');
    expect(render746).toContain('5282011236');
    expect(render898).toContain('16V4000C21');
    expect(render898).toContain('5272012973');
  });

  it('las figuras se numeran de forma independiente en cada uno', () => {
    // 7 fotos en el OT-746, 5 en el OT-898.
    expect((render746.match(/class="foto__numero"/g) ?? []).length).toBe(7);
    expect((render898.match(/class="foto__numero"/g) ?? []).length).toBe(5);
    expect(render746).toContain('Fig.07');
    expect(render898).not.toContain('Fig.06');
  });

  it('ninguno lleva el panel de ECU: los dos son motores de camión minero', () => {
    // El prototipo lo mostraba siempre; era ruido que el técnico se saltaba en
    // todos los informes.
    expect(render746).not.toContain('Parámetros ECU');
    expect(render898).not.toContain('Parámetros ECU');
  });
});

/**
 * Tablas dimensionales en el documento (E2.6).
 *
 * La regla que gobierna todo esto: **el informe se imprime y se fotocopia en
 * blanco y negro.** El color marca el estado en pantalla, pero es lo primero
 * que se pierde en papel, así que un valor fuera de tolerancia tiene que
 * distinguirse también sin él.
 */
describe('Tablas dimensionales', () => {
  const grilla = (extra: Record<string, unknown> = {}) => ({
    plantilla: 'tunel_bancada',
    nombre: 'Túnel de bancada',
    unidad: 'mm',
    filas: ['a', 'b1', 'Ovalidad'],
    columnas: ['1', '2', '3'],
    valores: [
      { fila: 'a', columna: '1', valor: 171.01, estado: 'ok', calculado: false },
      { fila: 'a', columna: '2', valor: 171.024, estado: 'alerta', calculado: false },
      { fila: 'a', columna: '3', valor: 171.04, estado: 'fuera', calculado: false },
      { fila: 'b1', columna: '1', valor: 171.015, estado: 'ok', calculado: false },
      { fila: 'Ovalidad', columna: '1', valor: 0.005, estado: null, calculado: true },
    ],
    especificacion: {
      nominal: 171.0,
      tolInf: 0,
      tolSup: 0.025,
      unidad: 'mm',
      fuente: 'Informe OT898',
      provisional: true,
    },
    resumen: { capturadas: 4, alertas: 1, fueraTolerancia: 1, veredicto: 'cambiar' },
    justificacion: null,
    ...extra,
  });

  const conGrilla = (extra: Record<string, unknown> = {}) =>
    render({
      bloques: [
        {
          id: 'm1',
          clave: 'trabajos',
          tipo: 'work_task',
          orden: 1,
          titulo: 'MEDICIÓN DEL TÚNEL DE BANCADA',
          texto: 'Se mide apoyo por apoyo.',
          mediciones: [grilla(extra)],
        },
      ],
    });

  it('saca la tabla con sus filas y columnas', () => {
    const html = conGrilla();
    expect(html).toContain('class="tabla-medicion"');
    expect(html).toContain('Túnel de bancada');
    expect(html).toContain('171.010');
  });

  it('el valor fuera de tolerancia se distingue sin depender del color', () => {
    const html = conGrilla();

    // Negrita y símbolo, además del rojo. Cualquiera de los tres por separado
    // se pierde en algún medio; los tres juntos, no.
    expect(html).toContain('celda--fuera');
    expect(REPORT_STYLES).toMatch(/\.celda--fuera[\s\S]*?font-weight:\s*700/);
    expect(REPORT_STYLES).toMatch(/\.celda--fuera::after/);
  });

  it('la alerta también va marcada, más suave', () => {
    expect(conGrilla()).toContain('celda--alerta');
    expect(REPORT_STYLES).toMatch(/\.celda--alerta\s*\{\s*font-weight:\s*600/);
  });

  it('dice contra qué se midió', () => {
    const html = conGrilla();

    // Sin la referencia, la tabla es una lista de números sin significado, que
    // es como sale hoy del Word.
    expect(html).toContain('Nominal');
    expect(html).toContain('171.000 mm');
    expect(html).toContain('Informe OT898');
    // Y que la tolerancia estaba sin contrastar (D1).
    expect(html).toContain('provisional');
  });

  it('sin especificación lo dice, en vez de callar', () => {
    const html = conGrilla({ especificacion: null });
    expect(html).toContain('Sin especificación cargada');
  });

  it('las celdas calculadas se distinguen de las medidas', () => {
    expect(conGrilla()).toContain('celda--calculada');
  });

  it('una celda sin capturar sale como raya, no como cero', () => {
    // Un cero es una medición; un hueco es que no se midió.
    expect(conGrilla()).toContain('<td>—</td>');
  });

  it('la leyenda cuenta cuántos se salieron y recoge la justificación', () => {
    const html = conGrilla({
      justificacion: 'El apoyo 3 se envía a rectificado externo antes del montaje.',
    });

    expect(html).toContain('1 valor(es) fuera de tolerancia');
    expect(html).toContain('rectificado externo');
  });

  it('sin valores fuera no pone leyenda', () => {
    const html = conGrilla({ resumen: { capturadas: 4, fueraTolerancia: 0 } });
    expect(html).not.toContain('fuera de tolerancia.');
  });

  it('la tabla no se parte entre páginas', () => {
    expect(REPORT_STYLES).toMatch(/\.tabla-medicion\s*\{[\s\S]*?break-inside:\s*avoid/);
  });

  describe('anexo de la hoja de mediciones (§12.4.7)', () => {
    it('reúne las grillas al final, en página nueva', () => {
      const html = conGrilla();

      // En el taller se imprime suelta: se lleva al banco y se compara contra
      // la pieza sin arrastrar las cuarenta páginas de fotografías.
      expect(html).toContain('Anexo · Hoja de mediciones');
      expect(html).toContain('hoja-mediciones');
      expect(REPORT_STYLES).toMatch(/\.hoja-mediciones[\s\S]*?break-before:\s*page/);
    });

    it('un informe sin mediciones no lleva anexo vacío', () => {
      expect(render()).not.toContain('Anexo · Hoja de mediciones');
    });

    it('se puede pedir el documento sin él', () => {
      const html = renderReportHtml(
        {
          ...informe,
          bloques: [
            {
              id: 'm1',
              clave: 'trabajos',
              tipo: 'work_task',
              orden: 1,
              titulo: 'MEDICIÓN',
              mediciones: [grilla()],
            },
          ],
        },
        SER_FOR_002_V01,
        { conAnexoDeMediciones: false },
      );

      expect(html).toContain('class="tabla-medicion"');
      expect(html).not.toContain('Anexo · Hoja de mediciones');
    });

    it('se puede generar suelto para imprimirlo aparte', () => {
      const anexo = renderMeasurementSheet({
        ...informe,
        bloques: [
          {
            id: 'm1',
            clave: 'trabajos',
            tipo: 'work_task',
            orden: 1,
            titulo: 'MEDICIÓN',
            mediciones: [grilla()],
          },
        ],
      });

      expect(anexo).toContain('Anexo · Hoja de mediciones');
      expect(anexo).toContain('Túnel de bancada');
    });
  });
});

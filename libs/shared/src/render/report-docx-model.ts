/**
 * Modelo neutro del informe para el export a Word (E3.5).
 *
 * No produce el `.docx`: produce **qué lleva el documento**, en una estructura
 * plana de párrafos y tablas. El archivo lo arma el worker, que es quien tiene
 * la librería de OOXML.
 *
 * Está separado por dos razones concretas:
 *
 * · **Se puede probar sin abrir Word.** Lo que decide si el export sirve es que
 *   estén todas las secciones, en su orden, con sus tablas y sus pies de figura.
 *   Eso se comprueba aquí; que Word no se queje es una comprobación distinta y
 *   la hace una persona.
 *
 * · **Sale de la misma plantilla que el PDF.** Un modelo propio acabaría
 *   divergiendo del HTML, y el `.docx` diría cosas distintas del mismo informe.
 */

import { isVisible } from '../domain/visibility';
import { resolveChecklist } from '../domain/checklist';
import type { TemplateVersionDefinition } from '../domain/templates';
import type { InformeRenderizable, BloqueRenderizable, GrillaRenderizable } from './report-html';
import { figureNumbersById } from '../domain/figures';

/** Un párrafo del documento, con el papel que cumple. */
export interface ParrafoDocx {
  readonly tipo: 'parrafo';
  readonly estilo: 'titulo1' | 'titulo2' | 'titulo3' | 'cuerpo' | 'pie' | 'vineta';
  readonly texto: string;
}

/** Una tabla. La primera fila es la cabecera cuando `conCabecera`. */
export interface TablaDocx {
  readonly tipo: 'tabla';
  readonly filas: readonly (readonly string[])[];
  readonly conCabecera: boolean;
  /** Celdas que van en negrita por estar fuera de tolerancia. `fila|columna`. */
  readonly destacadas?: readonly string[];
  /** Datos técnicos: el worker las compone en monoespaciada. */
  readonly monoespaciada?: boolean;
}

/** Una figura con su pie. La imagen la resuelve el worker desde `s3Key`. */
export interface FiguraDocx {
  readonly tipo: 'figura';
  readonly s3Key: string;
  readonly numero: number | null;
  readonly pie: string;
}

export type ElementoDocx = ParrafoDocx | TablaDocx | FiguraDocx;

export interface DocumentoDocx {
  readonly numeroInforme: string;
  readonly codigoFormato: string;
  readonly versionFormato: string;
  readonly elementos: readonly ElementoDocx[];
}

const parrafo = (estilo: ParrafoDocx['estilo'], texto: string): ParrafoDocx => ({
  tipo: 'parrafo',
  estilo,
  texto,
});

function fecha(valor: unknown): string {
  if (!valor) return '—';
  const d = valor instanceof Date ? valor : new Date(String(valor));
  return isNaN(d.getTime()) ? String(valor) : d.toLocaleDateString('es-PE');
}

function texto(valor: unknown): string {
  return valor === null || valor === undefined ? '' : String(valor);
}

/**
 * Tabla de una grilla de medición.
 *
 * Los valores fuera de tolerancia se marcan para que el worker los ponga en
 * **negrita**, no solo en color: el informe se imprime y se fotocopia en blanco
 * y negro, y en esa copia el color no existe (§8 del sistema de diseño).
 */
function tablaDeMedicion(grilla: GrillaRenderizable): TablaDocx {
  const columnas = grilla.columnas ?? [];
  const filas = grilla.filas ?? [];
  const porClave = new Map(
    (grilla.valores ?? []).map((v) => [`${v.fila}|${v.columna}`, v] as const),
  );

  const destacadas: string[] = [];
  const cuerpo = filas.map((fila) => [
    fila,
    ...columnas.map((columna) => {
      const celda = porClave.get(`${fila}|${columna}`);
      if (celda?.estado === 'fuera') destacadas.push(`${fila}|${columna}`);
      return celda?.valor === null || celda?.valor === undefined ? '' : celda.valor.toFixed(3);
    }),
  ]);

  return {
    tipo: 'tabla',
    conCabecera: true,
    monoespaciada: true,
    destacadas,
    filas: [[grilla.unidad ?? 'mm', ...columnas], ...cuerpo],
  };
}

function medicionesDe(bloque: BloqueRenderizable): ElementoDocx[] {
  const elementos: ElementoDocx[] = [];

  for (const grilla of bloque.mediciones ?? []) {
    elementos.push(parrafo('titulo3', grilla.nombre ?? 'Tabla dimensional'));

    const spec = grilla.especificacion;
    if (spec) {
      elementos.push(
        parrafo(
          'pie',
          `Nominal ${spec.nominal} ${spec.unidad} · Tolerancia ${spec.tolInf} / ${spec.tolSup}` +
            (spec.provisional ? ' · Provisional' : ''),
        ),
      );
    }

    elementos.push(tablaDeMedicion(grilla));

    // La justificación va pegada a su tabla y no al final del informe: quien
    // lee el número fuera de rango tiene que ver ahí mismo por qué se aceptó.
    if (grilla.justificacion) {
      elementos.push(parrafo('cuerpo', `Justificación: ${grilla.justificacion}`));
    }
  }

  return elementos;
}

function checklistDe(bloque: BloqueRenderizable, motor: Record<string, unknown>): ElementoDocx[] {
  const items = bloque.checklist?.items ?? [];
  if (!items.length) return [];

  const { filas } = resolveChecklist(items, bloque.checklist?.capturado ?? [], {
    cilindros: Number(motor['cilindros']) || undefined,
    apoyosBancada: Number(motor['apoyosBancada']) || undefined,
    bancos: Number(motor['bancos']) || undefined,
  });

  const destacadas: string[] = [];
  const cuerpo = filas.map((fila) => {
    if (fila.requiereAtencion) destacadas.push(`${fila.denominacion}|Estado`);
    return [
      fila.denominacion,
      // Sin revisar sale escrito y no en blanco: en blanco parece conforme, y
      // dar por bueno lo que nadie miró es lo que el inventario evita.
      fila.estado ? fila.estado : 'Sin revisar',
      fila.cantidad === null ? '' : String(fila.cantidad),
      fila.cantidadEsperadaResuelta === null ? '' : String(fila.cantidadEsperadaResuelta),
      fila.observacion ?? '',
    ];
  });

  return [
    {
      tipo: 'tabla',
      conCabecera: true,
      destacadas,
      filas: [['Denominación', 'Estado', 'Encontradas', 'Esperadas', 'Observación'], ...cuerpo],
    },
  ];
}

function tablaDeItems(datos: unknown): ElementoDocx[] {
  if (!Array.isArray(datos) || !datos.length) return [];

  const filas = datos as Record<string, unknown>[];
  const columnas = [...new Set(filas.flatMap((f) => Object.keys(f)))].filter(
    (c) => !c.endsWith('Id'),
  );
  if (!columnas.length) return [];

  return [
    {
      tipo: 'tabla',
      conCabecera: true,
      filas: [columnas, ...filas.map((f) => columnas.map((c) => texto(f[c])))],
    },
  ];
}

function bloqueDe(
  bloque: BloqueRenderizable,
  informe: InformeRenderizable,
  numeros: Map<string, number>,
): ElementoDocx[] {
  const elementos: ElementoDocx[] = [];
  if (bloque.titulo) elementos.push(parrafo('titulo2', bloque.titulo));

  switch (bloque.tipo) {
    case 'header_meta':
      elementos.push({
        tipo: 'tabla',
        conCabecera: false,
        filas: [
          ['N° de informe', informe.numeroInforme],
          ['N° de O/T', texto(informe.numeroOt) || '—'],
          ['Cliente', texto(informe.cliente?.nombre) || '—'],
          ['Sede', texto(informe.sede?.nombre) || '—'],
          ['Fecha de emisión', fecha(informe.fechaEmision)],
        ],
      });
      break;

    case 'equipment_meta': {
      const equipo = (informe.equipo ?? {}) as Record<string, unknown>;
      const motor = (informe.motor ?? {}) as Record<string, unknown>;
      elementos.push({
        tipo: 'tabla',
        conCabecera: false,
        filas: [
          ['Equipo', texto(equipo['codigo']) || '—'],
          ['Categoría', texto(equipo['categoria']) || '—'],
          ['Modelo de motor', texto(motor['modelo']) || '—'],
          ['N° de serie', texto(motor['serie']) || '—'],
          ['Horas', texto(motor['horas']) || '—'],
        ],
      });
      break;
    }

    case 'bullet_list': {
      const contenido = bloque.datos ?? informe.datos?.[bloque.clave];
      const lineas =
        typeof contenido === 'string'
          ? contenido.split('\n')
          : Array.isArray(contenido)
            ? contenido.map(texto)
            : [];
      for (const linea of lineas.filter((l) => l.trim())) {
        elementos.push(parrafo('vineta', linea.trim()));
      }
      break;
    }

    case 'rich_text': {
      const contenido = texto(bloque.texto ?? informe.datos?.[bloque.clave]);
      if (contenido.trim()) elementos.push(parrafo('cuerpo', contenido));
      break;
    }

    case 'work_task': {
      if (bloque.fechaTrabajo) {
        elementos.push(parrafo('pie', `Fecha: ${fecha(bloque.fechaTrabajo)}`));
      }
      if (bloque.texto) elementos.push(parrafo('cuerpo', bloque.texto));
      if (bloque.veredicto) {
        elementos.push(
          parrafo(
            'cuerpo',
            `Veredicto: ${bloque.veredicto}` +
              (bloque.accionRecomendada ? ` — ${bloque.accionRecomendada}` : ''),
          ),
        );
      }
      elementos.push(...medicionesDe(bloque));
      break;
    }

    case 'measurement_grid':
      elementos.push(...medicionesDe(bloque));
      break;

    case 'checklist':
      elementos.push(...checklistDe(bloque, (informe.motor ?? {}) as Record<string, unknown>));
      break;

    case 'items_table':
      elementos.push(...tablaDeItems(bloque.datos ?? informe.datos?.[bloque.clave]));
      break;

    default:
      break;
  }

  // Las fotos van al final del bloque, con su número de figura calculado desde
  // el orden (RN-06): el mismo que lleva el PDF, no uno propio del Word.
  for (const foto of bloque.fotos ?? []) {
    elementos.push({
      tipo: 'figura',
      s3Key: foto.s3Key,
      numero: numeros.get(foto.id) ?? null,
      pie: texto(foto.caption),
    });
  }

  return elementos;
}

/** Contexto de visibilidad. Es el mismo que usa el render HTML. */
function contextoDe(informe: InformeRenderizable): Record<string, unknown> {
  return {
    equipo: informe.equipo ?? {},
    motor: informe.motor ?? {},
    cliente: informe.cliente ?? {},
    intervencion: (informe.datos?.['intervencion'] as Record<string, unknown>) ?? {},
    informe: {
      ...informe.datos,
      tercerizados: (informe.datos?.['tercerizados'] as unknown[]) ?? [],
      mediciones: informe.bloques.filter((b) => b.tipo === 'measurement_grid'),
    },
  };
}

/**
 * Compone el modelo del `.docx` a partir del informe y su plantilla.
 *
 * Recorre las mismas secciones, con las mismas reglas de visibilidad y el mismo
 * orden que el PDF. Una sección sin contenido no se incluye: un Word con
 * epígrafes vacíos parece un informe a medias.
 */
export function buildDocxModel(
  informe: InformeRenderizable,
  plantilla: TemplateVersionDefinition,
): DocumentoDocx {
  const contexto = contextoDe(informe);
  const numeros = figureNumbersById(informe.bloques);

  const elementos: ElementoDocx[] = [
    parrafo('titulo1', 'Informe técnico de evaluación'),
    parrafo('pie', `${plantilla.codigo} ${plantilla.version} · ${informe.numeroInforme}`),
  ];

  for (const seccion of [...plantilla.secciones]
    .filter((s) => isVisible(s.visibleSi, contexto))
    .sort((a, b) => a.orden - b.orden)) {
    const cuerpo: ElementoDocx[] = [];

    for (const definicion of [...seccion.bloques]
      .filter((b) => isVisible(b.visibleSi, contexto))
      .sort((a, b) => a.orden - b.orden)) {
      const instancias = informe.bloques
        .filter((b) => b.clave === definicion.clave && b.visible !== false)
        .sort((a, b) => a.orden - b.orden);

      if (instancias.length) {
        for (const instancia of instancias) cuerpo.push(...bloqueDe(instancia, informe, numeros));
        continue;
      }

      // Sin instancias, algunos tipos se pintan igual porque leen del informe.
      if (['header_meta', 'equipment_meta'].includes(definicion.tipo)) {
        cuerpo.push(
          ...bloqueDe(
            {
              id: definicion.clave,
              clave: definicion.clave,
              tipo: definicion.tipo,
              orden: definicion.orden,
              titulo: null,
            },
            informe,
            numeros,
          ),
        );
      }
    }

    if (!cuerpo.length) continue;

    elementos.push(parrafo('titulo1', `${seccion.numeral}. ${seccion.titulo}`));
    elementos.push(...cuerpo);
  }

  return {
    numeroInforme: informe.numeroInforme,
    codigoFormato: plantilla.codigo,
    versionFormato: plantilla.version,
    elementos,
  };
}

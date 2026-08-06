/**
 * Construye el HTML del informe emitido.
 *
 * Una sola función para dos consumidores: la vista previa del wizard (UX-06) y
 * el render de PDF con Playwright (E1.7). Si cada uno construyera su propio
 * HTML, la vista previa dejaría de parecerse al PDF al primer cambio, y el
 * técnico descubriría las diferencias cuando el documento ya está entregado.
 *
 * Es una función pura: no lee de la red ni del disco. Las imágenes se resuelven
 * por `resolverImagen`, porque la vista previa usa URLs firmadas temporales y
 * el worker usa rutas locales ya descargadas.
 */

import { numberFigures, type FiguraNumerada } from '../domain/figures';
import {
  CHECKLIST_STATE_LABEL,
  resolveChecklist,
  type ChecklistCapturado,
  type ChecklistItem,
} from '../domain/checklist';
import { isVisible } from '../domain/visibility';
import type { TemplateSectionDefinition, TemplateVersionDefinition } from '../domain/templates';
import { REPORT_STYLES } from './report-styles';

export interface FotoRenderizable {
  readonly id: string;
  readonly s3Key: string;
  readonly printKey?: string | null;
  readonly caption?: string | null;
}

/** Grilla dimensional tal como queda guardada en el bloque (§16.2). */
export interface GrillaRenderizable {
  readonly plantilla?: string;
  readonly nombre?: string | null;
  readonly unidad?: string | null;
  readonly filas?: readonly string[];
  readonly columnas?: readonly string[];
  readonly valores?: readonly {
    readonly fila: string;
    readonly columna: string;
    readonly valor: number | null;
    readonly estado?: string | null;
    readonly calculado?: boolean;
  }[];
  readonly especificacion?: {
    readonly nominal: number;
    readonly tolInf: number;
    readonly tolSup: number;
    readonly unidad: string;
    readonly fuente: string;
    readonly provisional?: boolean;
  } | null;
  readonly resumen?: Record<string, unknown> | null;
  readonly justificacion?: string | null;
}

export interface BloqueRenderizable {
  readonly id: string;
  readonly clave: string;
  readonly tipo: string;
  readonly orden: number;
  readonly titulo?: string | null;
  readonly texto?: string | null;
  readonly fechaTrabajo?: string | Date | null;
  readonly veredicto?: string | null;
  readonly accionRecomendada?: string | null;
  readonly fotos?: readonly FotoRenderizable[];
  readonly mediciones?: readonly GrillaRenderizable[];
  /** Catálogo e inventario capturado del bloque `checklist` (D4). */
  readonly checklist?: {
    readonly items?: readonly ChecklistItem[];
    readonly capturado?: readonly ChecklistCapturado[];
  } | null;
  readonly datos?: unknown;
  readonly visible?: boolean;
}

export interface InformeRenderizable {
  readonly numeroInforme: string;
  readonly numeroOt?: string | null;
  readonly estado: string;
  readonly fechaEmision?: string | Date | null;
  readonly cliente?: { nombre?: string | null };
  readonly sede?: { nombre?: string | null };
  readonly equipo?: Record<string, unknown>;
  readonly motor?: Record<string, unknown>;
  readonly datos?: Record<string, unknown>;
  readonly bloques: readonly BloqueRenderizable[];
}

export interface OpcionesDeRender {
  /** `s3Key` → URL o ruta que Chromium pueda cargar. */
  readonly resolverImagen?: (clave: string) => string;
  /** Logo de la cabecera, ya como URL o `data:`. */
  readonly logo?: string;
  readonly codigoFormato?: string;
  readonly versionFormato?: string;
  /** Documento completo con `<html>`, o solo el cuerpo para incrustar. */
  readonly documentoCompleto?: boolean;
  /**
   * Anexo con todas las grillas al final (§12.4.7). Va por omisión: en el
   * taller la hoja se imprime suelta para llevarla al banco.
   */
  readonly conAnexoDeMediciones?: boolean;
}

/** Escapa lo que venga del usuario. El texto del informe lo escribe una persona. */
export function escapeHtml(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fecha(valor: unknown): string {
  if (!valor) return '—';
  const d = valor instanceof Date ? valor : new Date(String(valor));
  if (Number.isNaN(d.getTime())) return String(valor);
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function filas(pares: readonly [string, unknown][]): string {
  return pares
    .filter(([, valor]) => valor !== null && valor !== undefined && valor !== '')
    .map(
      ([etiqueta, valor]) =>
        `<tr><th scope="row">${escapeHtml(etiqueta)}</th><td>${escapeHtml(valor)}</td></tr>`,
    )
    .join('');
}

/** Bloque de fotos, en pares y con su figura ya numerada. */
function fotos(
  bloque: BloqueRenderizable,
  numeros: Map<string, FiguraNumerada>,
  opciones: OpcionesDeRender,
): string {
  const lista = bloque.fotos ?? [];
  if (!lista.length) return '';

  const resolver = opciones.resolverImagen ?? ((clave: string) => clave);

  const figuras = lista
    .map((foto) => {
      const numero = numeros.get(foto.id);
      const src = resolver(foto.printKey || foto.s3Key);
      const etiqueta = numero ? `<span class="foto__numero">${numero.etiqueta}</span> ` : '';
      return `
        <figure class="foto">
          <img src="${escapeHtml(src)}" alt="${escapeHtml(foto.caption ?? 'Fotografía del informe')}" />
          <figcaption>${etiqueta}${escapeHtml(foto.caption ?? '')}</figcaption>
        </figure>`;
    })
    .join('');

  return `<div class="fotos">${figuras}</div>`;
}

/** Convierte a viñetas un valor que puede llegar como lista o como texto. */
function vinetas(datos: unknown): string {
  const items = Array.isArray(datos)
    ? datos.map((d) => (typeof d === 'string' ? d : ((d as { texto?: string }).texto ?? '')))
    : String(datos ?? '')
        .split('\n')
        .map((l) => l.trim());

  const limpios = items.filter(Boolean);
  if (!limpios.length) return '';

  return `<ul class="vinetas">${limpios.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>`;
}

function tablaDeItems(datos: unknown): string {
  if (!Array.isArray(datos) || !datos.length) return '';

  const registros = datos as Record<string, unknown>[];
  const columnas = [...new Set(registros.flatMap((r) => Object.keys(r)))].filter(
    (c) => !c.startsWith('_') && !c.endsWith('Id'),
  );
  if (!columnas.length) return '';

  const cabecera = columnas.map((c) => `<th scope="col">${escapeHtml(c)}</th>`).join('');
  const cuerpo = registros
    .map((r) => `<tr>${columnas.map((c) => `<td>${escapeHtml(r[c] ?? '')}</td>`).join('')}</tr>`)
    .join('');

  return `<table class="tabla-datos"><thead><tr>${cabecera}</tr></thead><tbody>${cuerpo}</tbody></table>`;
}

/**
 * Una tabla dimensional (E2.6).
 *
 * Los valores fuera de tolerancia van en **negrita y con símbolo**, no solo en
 * rojo: este documento se imprime y se fotocopia en blanco y negro, y el color
 * es lo primero que se pierde. Es la misma razón por la que el semáforo de la
 * pantalla lleva icono además de fondo.
 */
function tablaDeMedicion(grilla: GrillaRenderizable): string {
  const filas = grilla.filas ?? [];
  const columnas = grilla.columnas ?? [];
  if (!filas.length || !columnas.length) return '';

  const porClave = new Map((grilla.valores ?? []).map((v) => [`${v.fila}|${v.columna}`, v]));

  const decimales = 3;
  const celda = (fila: string, columna: string): string => {
    const v = porClave.get(`${fila}|${columna}`);
    if (!v || v.valor === null || v.valor === undefined) return '<td>—</td>';

    const clases: string[] = [];
    if (v.calculado) clases.push('celda--calculada');
    if (v.estado === 'alerta') clases.push('celda--alerta');
    if (v.estado === 'fuera') clases.push('celda--fuera');

    const clase = clases.length ? ` class="${clases.join(' ')}"` : '';
    return `<td${clase}>${v.valor.toFixed(decimales)}</td>`;
  };

  const spec = grilla.especificacion;
  const referencia = spec
    ? `<p class="tabla-medicion__referencia">Nominal <strong>${spec.nominal.toFixed(
        decimales,
      )} ${escapeHtml(spec.unidad)}</strong> · Tolerancia ${
        spec.tolInf > 0 ? '+' : ''
      }${spec.tolInf} / ${spec.tolSup > 0 ? '+' : ''}${spec.tolSup} · Fuente: ${escapeHtml(
        spec.fuente,
      )}${spec.provisional ? ' (provisional)' : ''}</p>`
    : '<p class="tabla-medicion__referencia">Sin especificación cargada: los valores no se evaluaron contra ninguna tolerancia.</p>';

  const cabecera = columnas.map((c) => `<th scope="col">${escapeHtml(c)}</th>`).join('');
  const cuerpo = filas
    .map(
      (fila) =>
        `<tr><th scope="row">${escapeHtml(fila)}</th>${columnas
          .map((columna) => celda(fila, columna))
          .join('')}</tr>`,
    )
    .join('');

  const fuera = Number(grilla.resumen?.['fueraTolerancia'] ?? 0);
  const leyenda = fuera
    ? `<p class="leyenda-medicion">En negrita y con ⚠, los ${fuera} valor(es) fuera de tolerancia.` +
      (grilla.justificacion ? ` Justificación: ${escapeHtml(grilla.justificacion)}` : '') +
      '</p>'
    : '';

  return `${referencia}
    <table class="tabla-medicion">
      <caption>${escapeHtml(grilla.nombre ?? 'Tabla dimensional')}${
        grilla.unidad ? ` (${escapeHtml(grilla.unidad)})` : ''
      }</caption>
      <thead><tr><th scope="col"></th>${cabecera}</tr></thead>
      <tbody>${cuerpo}</tbody>
    </table>${leyenda}`;
}

/** Todas las grillas de un bloque. */
function medicionesDe(bloque: BloqueRenderizable): string {
  const grillas = bloque.mediciones ?? [];
  if (!grillas.length) return '';
  return grillas.map((g) => `<div class="bloque">${tablaDeMedicion(g)}</div>`).join('');
}

/**
 * Inventario de desarmado (SER-T-FOR-002, decisión D4).
 *
 * Sale dentro del propio informe, con su mismo número y su misma aprobación.
 * Lo que falta o está averiado va en negrita además de en color: es lo que
 * sobrevive a la fotocopia, igual que en las tablas dimensionales.
 */
function checklistDe(bloque: BloqueRenderizable, motor: Record<string, unknown>): string {
  const items = bloque.checklist?.items ?? [];
  if (!items.length) return '';

  const { filas, resumen } = resolveChecklist(items, bloque.checklist?.capturado ?? [], {
    cilindros: Number(motor['cilindros']) || undefined,
    apoyosBancada: Number(motor['apoyosBancada']) || undefined,
    bancos: Number(motor['bancos']) || undefined,
  });

  const cuerpo = filas
    .map((fila) => {
      const clase = fila.requiereAtencion
        ? ' class="checklist--atencion"'
        : fila.estado === null
          ? ' class="checklist--sin-revisar"'
          : '';

      const cantidad =
        fila.cantidad === null
          ? fila.cantidadEsperadaResuelta !== null
            ? `— / ${fila.cantidadEsperadaResuelta}`
            : '—'
          : fila.cantidadEsperadaResuelta !== null
            ? `${fila.cantidad} / ${fila.cantidadEsperadaResuelta}`
            : String(fila.cantidad);

      // Un ítem sin revisar se dice, no se deja en blanco: en blanco parece
      // conforme, y dar por bueno lo que nadie miró es lo que el inventario
      // existe para evitar.
      const estado = fila.estado ? CHECKLIST_STATE_LABEL[fila.estado] : 'Sin revisar';

      return `<tr${clase}>
        <td>${escapeHtml(fila.denominacion)}</td>
        <td class="cantidad">${escapeHtml(cantidad)}</td>
        <td>${escapeHtml(estado)}</td>
        <td>${escapeHtml(fila.observacion ?? '')}</td>
      </tr>`;
    })
    .join('');

  const pendientes = resumen.total - resumen.capturados;
  const leyenda =
    resumen.requierenAtencion || pendientes
      ? `<p class="leyenda-medicion">${
          resumen.requierenAtencion
            ? `${resumen.requierenAtencion} ítem(s) requieren atención. `
            : ''
        }${pendientes ? `${pendientes} sin revisar.` : ''}</p>`
      : '';

  return `<table class="tabla-checklist">
      <thead>
        <tr>
          <th scope="col">Componente</th>
          <th scope="col">Cant. / esperada</th>
          <th scope="col">Estado</th>
          <th scope="col">Observación</th>
        </tr>
      </thead>
      <tbody>${cuerpo}</tbody>
    </table>${leyenda}`;
}

/** Un bloque del informe, según su tipo. */
function renderBloque(
  bloque: BloqueRenderizable,
  informe: InformeRenderizable,
  numeros: Map<string, FiguraNumerada>,
  opciones: OpcionesDeRender,
): string {
  const titulo = bloque.titulo
    ? `<h3 class="bloque__titulo">${escapeHtml(bloque.titulo)}</h3>`
    : '';

  switch (bloque.tipo) {
    case 'header_meta':
      return `<div class="bloque">${titulo}<table class="tabla-datos"><tbody>${filas([
        ['N° de informe', informe.numeroInforme],
        ['N° de O/T', informe.numeroOt],
        ['Fecha de emisión', informe.fechaEmision ? fecha(informe.fechaEmision) : null],
        ['Cliente', informe.cliente?.nombre],
        ['Ubicación', informe.sede?.nombre],
        ['Motivo', informe.datos?.['motivo']],
        ['Horas totales', informe.datos?.['horasTotales']],
        ['Horas parciales', informe.datos?.['horasParciales']],
      ])}</tbody></table></div>`;

    case 'equipment_meta':
      return `<div class="bloque">${titulo}<table class="tabla-datos"><tbody>${filas([
        ['Equipo', informe.equipo?.['codigo']],
        ['Marca del equipo', informe.equipo?.['marca']],
        ['Modelo del equipo', informe.equipo?.['modelo']],
        ['Motor (serie)', informe.motor?.['serie']],
        ['Marca del motor', informe.motor?.['marca']],
        ['Modelo del motor', informe.motor?.['modelo']],
        ['Cilindros', informe.motor?.['cilindros']],
        ['Apoyos de bancada', informe.motor?.['apoyosBancada']],
        ['Potencia', informe.motor?.['potencia']],
      ])}</tbody></table></div>`;

    case 'rich_text':
      return `<div class="bloque">${titulo}<p class="bloque__texto">${escapeHtml(
        bloque.texto ?? informe.datos?.[bloque.clave] ?? '',
      )}</p></div>`;

    case 'bullet_list':
      return `<div class="bloque">${titulo}${vinetas(
        bloque.datos ?? informe.datos?.[bloque.clave],
      )}</div>`;

    case 'work_task': {
      const cuando = bloque.fechaTrabajo
        ? `<p class="bloque__texto"><strong>Fecha:</strong> ${fecha(bloque.fechaTrabajo)}</p>`
        : '';
      const veredicto = bloque.veredicto
        ? `<p class="bloque__texto"><strong>Veredicto:</strong> ${escapeHtml(bloque.veredicto)}` +
          (bloque.accionRecomendada ? ` — ${escapeHtml(bloque.accionRecomendada)}` : '') +
          `</p>`
        : '';

      return `<div class="bloque">${titulo}${cuando}<p class="bloque__texto">${escapeHtml(
        bloque.texto ?? '',
      )}</p>${veredicto}${medicionesDe(bloque)}${fotos(bloque, numeros, opciones)}</div>`;
    }

    case 'photo_grid':
      return `<div class="bloque">${titulo}${fotos(bloque, numeros, opciones)}</div>`;

    case 'measurement_grid':
      return `<div class="bloque">${titulo}${medicionesDe(bloque)}</div>`;

    case 'checklist':
      return `<div class="bloque">${titulo}${checklistDe(bloque, informe.motor ?? {})}</div>`;

    case 'items_table':
      return `<div class="bloque">${titulo}${tablaDeItems(
        bloque.datos ?? informe.datos?.[bloque.clave],
      )}</div>`;

    case 'signature_block': {
      const participantes =
        (informe.datos?.['participantes'] as { nombre?: string; cargo?: string; rol?: string }[]) ??
        [];
      const firma = (rol: string, titulo: string) => {
        const quien = participantes.find((p) => p.rol === rol);
        return `<div class="firma">
          <div class="firma__linea"></div>
          <div class="firma__nombre">${escapeHtml(quien?.nombre ?? '')}</div>
          <div class="firma__cargo">${escapeHtml(quien?.cargo ?? titulo)}</div>
        </div>`;
      };
      return `<div class="firmas">${firma('realizado_por', 'Realizado por')}${firma(
        'revisado_por',
        'Revisado por',
      )}</div>`;
    }

    default:
      // Un tipo que este render todavía no cubre se omite en silencio en vez de
      // sacar una caja vacía: el documento va al cliente.
      return '';
  }
}

function renderSeccion(
  seccion: TemplateSectionDefinition,
  informe: InformeRenderizable,
  numeros: Map<string, FiguraNumerada>,
  opciones: OpcionesDeRender,
): string {
  const contexto = contextoDe(informe);

  const cuerpo = seccion.bloques
    .filter((definicion) => isVisible(definicion.visibleSi, contexto))
    .sort((a, b) => a.orden - b.orden)
    .flatMap((definicion) => {
      // Un bloque repetible aparece tantas veces como instancias tenga el
      // informe: catorce «DESMONTAJE DE …» con una sola definición.
      const instancias = informe.bloques
        .filter((b) => b.clave === definicion.clave && b.visible !== false)
        .sort((a, b) => a.orden - b.orden);

      if (instancias.length) {
        return instancias.map((b) => renderBloque(b, informe, numeros, opciones));
      }

      // Sin instancias, algunos tipos se pintan igual porque leen del informe.
      return ['header_meta', 'equipment_meta', 'signature_block'].includes(definicion.tipo)
        ? [
            renderBloque(
              {
                id: definicion.clave,
                clave: definicion.clave,
                tipo: definicion.tipo,
                orden: definicion.orden,
                titulo: null,
              },
              informe,
              numeros,
              opciones,
            ),
          ]
        : [];
    })
    .join('');

  if (!cuerpo.trim()) return '';

  return `<section class="seccion">
    <h2 class="seccion__titulo">${escapeHtml(seccion.numeral)}. ${escapeHtml(seccion.titulo)}</h2>
    ${cuerpo}
  </section>`;
}

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

function cabecera(informe: InformeRenderizable, opciones: OpcionesDeRender): string {
  const logo = opciones.logo
    ? `<img src="${escapeHtml(opciones.logo)}" alt="Detroit Power System" />`
    : '';

  return `<header class="cabecera">
    <div class="cabecera__logo">${logo}</div>
    <div class="cabecera__titulo">Informe técnico de evaluación</div>
    <dl class="cabecera__meta">
      <div><dt>Código</dt><dd>${escapeHtml(opciones.codigoFormato ?? 'SER-FOR-002')}</dd></div>
      <div><dt>Versión</dt><dd>${escapeHtml(opciones.versionFormato ?? 'v01')}</dd></div>
      <div><dt>Fecha</dt><dd>${fecha(informe.fechaEmision)}</dd></div>
      <div><dt>N°</dt><dd>${escapeHtml(informe.numeroInforme)}</dd></div>
    </dl>
  </header>`;
}

/**
 * Anexo «hoja de mediciones» (§12.4.7).
 *
 * Reúne todas las grillas del informe en una sección propia, que empieza en
 * página nueva. Existe porque en el taller se usa suelta: se imprime, se lleva
 * al banco y se compara contra la pieza sin arrastrar las cuarenta páginas de
 * fotografías.
 *
 * No duplica datos: son las mismas grillas ya guardadas en sus bloques.
 */
export function renderMeasurementSheet(informe: InformeRenderizable): string {
  const conGrillas = informe.bloques
    .filter((b) => b.visible !== false && (b.mediciones ?? []).length > 0)
    .sort((a, b) => a.orden - b.orden);

  if (!conGrillas.length) return '';

  const cuerpo = conGrillas
    .map((bloque) => {
      const titulo = bloque.titulo
        ? `<h3 class="bloque__titulo">${escapeHtml(bloque.titulo)}</h3>`
        : '';
      return `<div class="bloque">${titulo}${medicionesDe(bloque)}</div>`;
    })
    .join('');

  return `<section class="seccion hoja-mediciones">
    <h2 class="seccion__titulo">Anexo · Hoja de mediciones</h2>
    ${cuerpo}
  </section>`;
}

/**
 * Documento completo del informe.
 *
 * Las figuras se numeran aquí, desde el orden de los bloques, con la misma
 * función que usa la API (RN-06). Es lo que garantiza que el número que el
 * técnico ve en pantalla sea el que sale impreso.
 */
export function renderReportHtml(
  informe: InformeRenderizable,
  plantilla: TemplateVersionDefinition,
  opciones: OpcionesDeRender = {},
): string {
  const numeros = new Map(
    numberFigures(
      informe.bloques.map((b) => ({
        id: b.id,
        orden: b.orden,
        visible: b.visible,
        fotos: (b.fotos ?? []).map((f) => ({ id: f.id })),
      })),
    ).map((f) => [f.fotoId, f]),
  );

  const contexto = contextoDe(informe);

  const secciones = [...plantilla.secciones]
    .filter((s) => isVisible(s.visibleSi, contexto))
    .sort((a, b) => a.orden - b.orden)
    .map((s) => renderSeccion(s, informe, numeros, opciones))
    .join('');

  const esBorrador = informe.estado !== 'emitido';

  const cuerpo = `<div class="hoja${esBorrador ? ' borrador' : ''}">
    ${cabecera(informe, opciones)}
    ${secciones}
    ${opciones.conAnexoDeMediciones === false ? '' : renderMeasurementSheet(informe)}
  </div>`;

  if (opciones.documentoCompleto === false) return cuerpo;

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(informe.numeroInforme)}</title>
<style>${REPORT_STYLES}</style>
</head>
<body>${cuerpo}</body>
</html>`;
}

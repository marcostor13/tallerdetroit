/**
 * Modelo de plantillas de informe (§11).
 *
 * Una plantilla describe *qué se captura y en qué orden*; el informe es una
 * instancia con valores. La definición vive aquí, en `libs/shared`, porque tres
 * consumidores tienen que entenderla igual: el wizard que la pinta, el backend
 * que la valida al emitir, y el render que la convierte en PDF.
 *
 * Regla de inmutabilidad (§11.1): al emitir, el informe se queda con una copia
 * completa de la versión. Si Calidad publica v02, los informes emitidos con v01
 * se siguen renderizando idénticos para siempre. Es un formato controlado; que
 * un documento firmado cambie de forma retroactivamente no es una opción.
 */

import { evaluateVisibility, isVisible, type VisibilityContext } from './visibility';

/** Catálogo cerrado de tipos de bloque (§11.2). */
export const BLOCK_TYPES = [
  'header_meta',
  'equipment_meta',
  'rich_text',
  'bullet_list',
  'work_task',
  'photo_grid',
  'measurement_grid',
  'key_value_table',
  'items_table',
  'checklist',
  'parameters_panel',
  'signature_block',
  'attachment',
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];

/**
 * Bloques que el técnico añade tantas veces como necesite durante la captura.
 *
 * El informe OT746 tiene catorce «DESMONTAJE DE …»; el OT898 tiene otros
 * tantos distintos. La plantilla declara el bloque una vez y el wizard permite
 * repetirlo; lo contrario obligaría a una plantilla por informe.
 */
export const REPEATABLE_BLOCK_TYPES: readonly BlockType[] = [
  'work_task',
  'photo_grid',
  'measurement_grid',
  'attachment',
];

export function isRepeatable(tipo: BlockType): boolean {
  return REPEATABLE_BLOCK_TYPES.includes(tipo);
}

export type TemplateStatus = 'borrador' | 'publicada' | 'retirada';

export interface TemplateBlockDefinition {
  readonly clave: string;
  readonly tipo: BlockType;
  readonly titulo: string;
  readonly orden: number;
  /** Obligatorio para emitir. En un bloque repetible exige al menos una instancia. */
  readonly obligatorio?: boolean;
  /** Regla de §11.3. Sin regla, siempre visible. */
  readonly visibleSi?: string;
  /** Ajustes propios del tipo: columnas de una tabla, maestro de un `items_table`… */
  readonly config?: Record<string, unknown>;
  readonly ayuda?: string;
}

export interface TemplateSectionDefinition {
  readonly clave: string;
  /** Numeración romana del formato impreso: I, II, III… */
  readonly numeral: string;
  readonly titulo: string;
  readonly orden: number;
  /** Paso del wizard en el que se captura (§14.1). */
  readonly paso: number;
  readonly visibleSi?: string;
  readonly bloques: readonly TemplateBlockDefinition[];
}

export interface TemplateVersionDefinition {
  readonly codigo: string;
  readonly version: string;
  readonly nombre: string;
  readonly estado: TemplateStatus;
  readonly secciones: readonly TemplateSectionDefinition[];
}

/** Una sección o bloque ya resuelto contra el contexto de un informe concreto. */
export interface ResolvedSection extends Omit<TemplateSectionDefinition, 'bloques'> {
  readonly bloques: readonly TemplateBlockDefinition[];
}

/**
 * Aplica las reglas de visibilidad y devuelve solo lo que corresponde a este
 * informe, ya ordenado.
 *
 * Una sección oculta se lleva sus bloques por delante aunque la regla del bloque
 * dijera que sí: si la sección no va en el documento, sus bloques tampoco.
 */
export function resolveTemplate(
  definicion: TemplateVersionDefinition,
  contexto: VisibilityContext,
): ResolvedSection[] {
  return [...definicion.secciones]
    .filter((seccion) => isVisible(seccion.visibleSi, contexto))
    .sort((a, b) => a.orden - b.orden)
    .map((seccion) => ({
      ...seccion,
      bloques: [...seccion.bloques]
        .filter((bloque) => isVisible(bloque.visibleSi, contexto))
        .sort((a, b) => a.orden - b.orden),
    }));
}

/** Bloques visibles de todas las secciones, en el orden en que se capturan. */
export function resolveBlocks(
  definicion: TemplateVersionDefinition,
  contexto: VisibilityContext,
): TemplateBlockDefinition[] {
  return resolveTemplate(definicion, contexto).flatMap((s) => s.bloques);
}

export interface MissingBlock {
  readonly seccion: string;
  readonly clave: string;
  readonly titulo: string;
  /** Paso del wizard al que hay que llevar al usuario cuando pulse el aviso. */
  readonly paso: number;
}

/**
 * Qué falta para poder emitir (UX-07).
 *
 * Devuelve la lista en vez de un booleano a propósito: el requisito es que
 * enviar con errores muestre los campos faltantes **navegables por clic**, no
 * un «faltan datos» que obliga a buscarlos a mano por seis pasos.
 *
 * `bloquesConDatos` son las claves que el informe tiene rellenas; calcularlo es
 * responsabilidad de quien conoce la forma del informe, no de la plantilla.
 */
export function findMissingBlocks(
  definicion: TemplateVersionDefinition,
  contexto: VisibilityContext,
  bloquesConDatos: ReadonlySet<string>,
): MissingBlock[] {
  return resolveTemplate(definicion, contexto).flatMap((seccion) =>
    seccion.bloques
      .filter((bloque) => bloque.obligatorio && !bloquesConDatos.has(bloque.clave))
      .map((bloque) => ({
        seccion: seccion.titulo,
        clave: bloque.clave,
        titulo: bloque.titulo,
        paso: seccion.paso,
      })),
  );
}

/**
 * Comprueba que una definición es coherente antes de publicarla.
 *
 * Se ejecuta al publicar y no al guardar el borrador: Calidad tiene que poder
 * dejar una plantilla a medias sin que la plataforma se lo impida.
 */
export function validateTemplate(definicion: TemplateVersionDefinition): string[] {
  const errores: string[] = [];

  if (!definicion.secciones.length) {
    errores.push('La plantilla no tiene ninguna sección.');
  }

  const clavesDeBloque = new Map<string, string>();
  const clavesDeSeccion = new Set<string>();

  /**
   * En ejecución una regla rota se ignora y se muestra de más, que es lo
   * prudente ante un informe a medio llenar. Pero entonces nadie se entera
   * nunca: publicar es el único momento en que la errata puede salir a la luz.
   */
  const revisarRegla = (regla: string | undefined, donde: string): void => {
    if (!regla?.trim()) return;
    try {
      evaluateVisibility(regla, {});
    } catch (error) {
      errores.push(`${donde}: ${(error as Error).message}`);
    }
  };

  for (const seccion of definicion.secciones) {
    if (clavesDeSeccion.has(seccion.clave)) {
      errores.push(`La sección «${seccion.clave}» está repetida.`);
    }
    clavesDeSeccion.add(seccion.clave);

    if (!seccion.bloques.length) {
      errores.push(`La sección «${seccion.titulo}» no tiene bloques.`);
    }

    revisarRegla(seccion.visibleSi, `Sección «${seccion.titulo}»`);

    for (const bloque of seccion.bloques) {
      revisarRegla(bloque.visibleSi, `Bloque «${bloque.clave}»`);

      // Las claves identifican los valores dentro del informe. Repetirlas haría
      // que un bloque pisara los datos de otro.
      const anterior = clavesDeBloque.get(bloque.clave);
      if (anterior) {
        errores.push(
          `La clave de bloque «${bloque.clave}» se usa en «${anterior}» y en «${seccion.titulo}».`,
        );
      }
      clavesDeBloque.set(bloque.clave, seccion.titulo);

      if (!BLOCK_TYPES.includes(bloque.tipo)) {
        errores.push(`El bloque «${bloque.clave}» usa un tipo desconocido: «${bloque.tipo}».`);
      }
    }
  }

  return errores;
}

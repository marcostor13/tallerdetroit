import { describe, expect, it } from 'vitest';
import {
  CHECKLIST_STATE_LABEL,
  checklistIncompleto,
  resolveChecklist,
  type ChecklistItem,
} from './checklist';

/** Piezas que se inventarían al desarmar un motor. */
const ITEMS: ChecklistItem[] = [
  { clave: 'culata', denominacion: 'Culatas', grupo: 'culatas', cantidadDerivadaDe: 'cilindros' },
  { clave: 'piston', denominacion: 'Pistones', grupo: 'tren', cantidadDerivadaDe: 'cilindros' },
  { clave: 'turbo', denominacion: 'Turbocompresores', grupo: 'admision', cantidadEsperada: 2 },
  { clave: 'cac', denominacion: 'Enfriador de aire (CAC)', grupo: 'admision', cantidadEsperada: 1 },
];

const MTU_20V = { cilindros: 20, apoyosBancada: 11, bancos: 2 };

describe('Inventario de desarmado (D4)', () => {
  it('la cantidad esperada sale del motor cuando es variable', () => {
    // Un 20V lleva veinte pistones y un 16V dieciséis: no puede estar escrito
    // en el catálogo.
    const veinte = resolveChecklist(ITEMS, [], MTU_20V);
    const dieciseis = resolveChecklist(ITEMS, [], { cilindros: 16, bancos: 2 });

    const esperada = (r: typeof veinte, clave: string) =>
      r.filas.find((f) => f.clave === clave)?.cantidadEsperadaResuelta;

    expect(esperada(veinte, 'piston')).toBe(20);
    expect(esperada(dieciseis, 'piston')).toBe(16);
    // Los turbos son dos en los dos.
    expect(esperada(veinte, 'turbo')).toBe(2);
  });

  it('un ítem sin capturar no cuenta como conforme', () => {
    // Dar por bueno lo que nadie ha mirado es justo lo que el inventario existe
    // para evitar: lo que falta se descubre ahora o al montarlo tres semanas
    // después.
    const r = resolveChecklist(ITEMS, [{ clave: 'culata', estado: 'ok', cantidad: 20 }], MTU_20V);

    expect(r.filas.find((f) => f.clave === 'piston')?.estado).toBeNull();
    expect(r.resumen.conformes).toBe(1);
    expect(r.resumen.capturados).toBe(1);
    expect(r.resumen.total).toBe(4);
  });

  it('cuenta cada estado por separado', () => {
    const r = resolveChecklist(
      ITEMS,
      [
        { clave: 'culata', estado: 'ok', cantidad: 20 },
        { clave: 'piston', estado: 'averiado', observacion: 'Dos con falda rayada' },
        { clave: 'turbo', estado: 'falta' },
        { clave: 'cac', estado: 'no_aplica' },
      ],
      MTU_20V,
    );

    expect(r.resumen).toMatchObject({
      total: 4,
      capturados: 4,
      conformes: 1,
      averiados: 1,
      faltantes: 1,
      noAplica: 1,
    });
  });

  describe('qué requiere atención', () => {
    it('lo que falta y lo averiado', () => {
      const r = resolveChecklist(
        ITEMS,
        [
          { clave: 'culata', estado: 'ok', cantidad: 20 },
          { clave: 'piston', estado: 'averiado' },
          { clave: 'turbo', estado: 'falta' },
        ],
        MTU_20V,
      );

      expect(r.resumen.requierenAtencion).toBe(2);
      expect(r.filas.find((f) => f.clave === 'culata')?.requiereAtencion).toBe(false);
    });

    it('y una cantidad que no cuadra con la esperada', () => {
      // Diecinueve pistones en un 20V dados por conformes: alguien tiene que
      // mirar eso antes de emitir.
      const r = resolveChecklist(ITEMS, [{ clave: 'piston', estado: 'ok', cantidad: 19 }], MTU_20V);

      expect(r.filas.find((f) => f.clave === 'piston')?.requiereAtencion).toBe(true);
    });

    it('pero no si el ítem ya está señalado por otro motivo', () => {
      // Un «averiado» con cantidad distinta no se cuenta dos veces.
      const r = resolveChecklist(
        ITEMS,
        [{ clave: 'piston', estado: 'averiado', cantidad: 19 }],
        MTU_20V,
      );
      expect(r.resumen.requierenAtencion).toBe(1);
    });

    it('sin cantidad esperada no se inventa una discrepancia', () => {
      const sinCantidad: ChecklistItem[] = [{ clave: 'x', denominacion: 'Pieza suelta' }];
      const r = resolveChecklist(sinCantidad, [{ clave: 'x', estado: 'ok', cantidad: 3 }]);
      expect(r.filas[0]?.requiereAtencion).toBe(false);
    });
  });

  describe('qué bloquea la emisión', () => {
    it('dejarlo a medias, sí', () => {
      // Un inventario con dos de cuatro afirma menos de lo que aparenta.
      const r = resolveChecklist(ITEMS, [{ clave: 'culata', estado: 'ok', cantidad: 20 }], MTU_20V);
      expect(checklistIncompleto(r)).toBe(3);
    });

    it('que falten piezas o estén averiadas, no', () => {
      // Es precisamente lo que el inventario documenta: un motor llega como
      // llega, y ocultarlo sería el problema.
      const r = resolveChecklist(
        ITEMS,
        [
          { clave: 'culata', estado: 'falta' },
          { clave: 'piston', estado: 'averiado' },
          { clave: 'turbo', estado: 'falta' },
          { clave: 'cac', estado: 'averiado' },
        ],
        MTU_20V,
      );

      expect(checklistIncompleto(r)).toBe(0);
      expect(r.resumen.requierenAtencion).toBe(4);
    });
  });

  it('conserva la observación de quien lo revisó', () => {
    const r = resolveChecklist(
      ITEMS,
      [{ clave: 'piston', estado: 'averiado', observacion: 'Dos con falda rayada' }],
      MTU_20V,
    );
    expect(r.filas.find((f) => f.clave === 'piston')?.observacion).toBe('Dos con falda rayada');
  });

  it('cada estado tiene su rótulo para el documento', () => {
    // En el informe impreso no aparece `no_aplica`.
    expect(CHECKLIST_STATE_LABEL.no_aplica).toBe('No aplica');
    expect(CHECKLIST_STATE_LABEL.ok).toBe('Conforme');
    expect(CHECKLIST_STATE_LABEL.averiado).toBe('Averiado');
  });

  it('mantiene el orden y el grupo del catálogo', () => {
    const r = resolveChecklist(ITEMS, [], MTU_20V);
    expect(r.filas.map((f) => f.clave)).toEqual(['culata', 'piston', 'turbo', 'cac']);
    expect(r.filas[0]?.grupo).toBe('culatas');
  });
});

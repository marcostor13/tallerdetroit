import { describe, expect, it } from 'vitest';
import {
  figureNumbersById,
  formatFigureLabel,
  moveBlock,
  numberFigures,
  type NumerableBloque,
} from './figures';

/** Tres trabajos con fotos, como los del OT-746. */
const bloques: NumerableBloque[] = [
  { id: 'culatas', orden: 1, fotos: [{ id: 'f1' }, { id: 'f2' }] },
  { id: 'pistones', orden: 2, fotos: [{ id: 'f3' }, { id: 'f4' }, { id: 'f5' }] },
  { id: 'cigueñal', orden: 3, fotos: [{ id: 'f6' }] },
];

describe('Numeración de figuras', () => {
  it('numera correlativamente en todo el informe, no por bloque', () => {
    const figuras = numberFigures(bloques);
    expect(figuras.map((f) => f.numero)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(figuras.map((f) => f.fotoId)).toEqual(['f1', 'f2', 'f3', 'f4', 'f5', 'f6']);
  });

  it('rellena con ceros: Fig.07, no Fig.7', () => {
    expect(formatFigureLabel(7)).toBe('Fig.07');
    expect(formatFigureLabel(12)).toBe('Fig.12');
    expect(formatFigureLabel(100)).toBe('Fig.100');
  });

  it('al mover un bloque, la numeración se recalcula sola (RN-06)', () => {
    // Es el defecto del Word: se mueve el bloque y el texto sigue diciendo
    // «ver Fig. 3» apuntando a otra foto.
    const reordenados = moveBlock(bloques, 2, 0);
    expect(reordenados.map((b) => b.id)).toEqual(['cigueñal', 'culatas', 'pistones']);

    const numeros = figureNumbersById(reordenados);
    expect(numeros.get('f6')).toBe(1);
    expect(numeros.get('f1')).toBe(2);
    expect(numeros.get('f3')).toBe(4);
  });

  it('el número no se guarda: se deriva del orden, así que no se queda viejo', () => {
    // La misma foto cambia de número sin que nadie escriba nada.
    const antes = figureNumbersById(bloques).get('f6');
    const despues = figureNumbersById(moveBlock(bloques, 2, 0)).get('f6');
    expect(antes).toBe(6);
    expect(despues).toBe(1);
  });

  it('un bloque oculto no consume número: no deja huecos en el documento', () => {
    const conOculto: NumerableBloque[] = [
      { id: 'a', orden: 1, fotos: [{ id: 'f1' }] },
      { id: 'b', orden: 2, visible: false, fotos: [{ id: 'f2' }] },
      { id: 'c', orden: 3, fotos: [{ id: 'f3' }] },
    ];

    const numeros = figureNumbersById(conOculto);
    expect(numeros.get('f1')).toBe(1);
    expect(numeros.get('f2')).toBeUndefined();
    expect(numeros.get('f3')).toBe(2);
  });

  it('respeta el orden declarado aunque la lista llegue desordenada', () => {
    const desordenados: NumerableBloque[] = [
      { id: 'c', orden: 3, fotos: [{ id: 'f3' }] },
      { id: 'a', orden: 1, fotos: [{ id: 'f1' }] },
      { id: 'b', orden: 2, fotos: [{ id: 'f2' }] },
    ];
    expect(numberFigures(desordenados).map((f) => f.fotoId)).toEqual(['f1', 'f2', 'f3']);
  });

  it('los bloques sin fotos no estorban', () => {
    const conTexto: NumerableBloque[] = [
      { id: 'antecedentes', orden: 1 },
      { id: 'culatas', orden: 2, fotos: [{ id: 'f1' }] },
    ];
    expect(numberFigures(conTexto)).toHaveLength(1);
    expect(numberFigures(conTexto)[0]?.numero).toBe(1);
  });

  describe('reordenamiento', () => {
    it('deja los órdenes contiguos desde 1', () => {
      const salteados = [{ orden: 5 }, { orden: 10 }, { orden: 20 }];
      expect(moveBlock(salteados, 0, 2).map((b) => b.orden)).toEqual([1, 2, 3]);
    });

    it('mueve hacia abajo', () => {
      const r = moveBlock(bloques, 0, 2);
      expect(r.map((b) => b.id)).toEqual(['pistones', 'cigueñal', 'culatas']);
    });

    it('un índice fuera de rango no rompe la lista, solo la normaliza', () => {
      const r = moveBlock(bloques, 9, 0);
      expect(r.map((b) => b.id)).toEqual(['culatas', 'pistones', 'cigueñal']);
      expect(r.map((b) => b.orden)).toEqual([1, 2, 3]);
    });

    it('no muta la lista original', () => {
      moveBlock(bloques, 2, 0);
      expect(bloques.map((b) => b.id)).toEqual(['culatas', 'pistones', 'cigueñal']);
    });
  });
});

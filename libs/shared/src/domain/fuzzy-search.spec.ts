import { describe, expect, it } from 'vitest';
import { editDistance, fuzzySearch, normalize, similarity } from './fuzzy-search';

describe('normalize', () => {
  it('quita tildes, unifica mayúsculas y colapsa espacios', () => {
    expect(normalize('REYNALDO CÁCERES')).toBe('reynaldo caceres');
    expect(normalize('  Piñón   Intermedio ')).toBe('pinon intermedio');
  });

  /**
   * La eñe se pliega a `n` a propósito: en una búsqueda tolerante quien teclee
   * «pinon» debe encontrar «piñón». Es para comparar, no para mostrar — el
   * texto original nunca se altera.
   */
  it('pliega la eñe para que se pueda buscar sin ella', () => {
    expect(normalize('piñón')).toBe(normalize('pinon'));
  });
});

describe('editDistance', () => {
  it('cuenta las sustituciones', () => {
    expect(editDistance('komatsu', 'komatzu')).toBe(1);
    expect(editDistance('abc', 'abc')).toBe(0);
  });

  it('corta pronto cuando supera el umbral', () => {
    // No importa el valor exacto, solo que rebase el umbral.
    expect(editDistance('abcdefgh', 'zzzzzzzz', 2)).toBeGreaterThan(2);
  });
});

describe('similarity', () => {
  it('lo idéntico puntúa 1', () => {
    expect(similarity('KOMATSU', 'komatsu')).toBe(1);
  });

  it('prioriza lo que empieza igual sobre lo que solo contiene', () => {
    expect(similarity('koma', 'KOMATSU')).toBeGreaterThan(similarity('mats', 'KOMATSU'));
  });

  it('encuentra por una palabra interior: el caso SPCC. TOQUEPALA', () => {
    expect(similarity('toq', 'SPCC. TOQUEPALA')).toBeGreaterThan(0.5);
  });

  it('no relaciona cosas distintas', () => {
    expect(similarity('caterpillar', 'KOMATSU')).toBe(0);
  });
});

describe('fuzzySearch', () => {
  const marcas = [{ nombre: 'KOMATSU' }, { nombre: 'CATERPILLAR' }, { nombre: 'MTU' }];
  const campos = (m: { nombre: string }) => [m.nombre];

  /** El requisito literal de §13.3.2, con el typo que traen los informes. */
  it('KOMATZU sugiere KOMATSU', () => {
    const r = fuzzySearch('KOMATZU', marcas, campos);
    expect(r[0]?.item.nombre).toBe('KOMATSU');
  });

  it('tolera otras erratas frecuentes', () => {
    for (const typo of ['komasu', 'komatsy', 'KOMATSU ']) {
      expect(fuzzySearch(typo, marcas, campos)[0]?.item.nombre).toBe('KOMATSU');
    }
  });

  it('con la consulta vacía devuelve todo', () => {
    expect(fuzzySearch('', marcas, campos)).toHaveLength(3);
  });

  it('busca en varios campos y se queda con el mejor', () => {
    const clientes = [
      { razonSocial: 'SOUTHERN PERU COPPER CORPORATION', nombreCorto: 'SPCC. TOQUEPALA' },
      { razonSocial: 'TECNOLOGICA DE ALIMENTOS S.A.', nombreCorto: 'TASA' },
    ];
    const f = (c: (typeof clientes)[number]) => [c.razonSocial, c.nombreCorto];

    expect(fuzzySearch('toquepala', clientes, f)[0]?.item.nombreCorto).toBe('SPCC. TOQUEPALA');
    expect(fuzzySearch('southern', clientes, f)[0]?.item.nombreCorto).toBe('SPCC. TOQUEPALA');
    expect(fuzzySearch('tasa', clientes, f)[0]?.item.nombreCorto).toBe('TASA');
  });

  it('respeta el límite y ordena de más a menos parecido', () => {
    const r = fuzzySearch('m', [...marcas, { nombre: 'MERCEDES' }], campos, { limit: 2 });
    expect(r.length).toBeLessThanOrEqual(2);
    expect(r[0]!.score).toBeGreaterThanOrEqual(r[1]?.score ?? 0);
  });

  it('descarta lo que no llega al umbral', () => {
    expect(fuzzySearch('zzzzzz', marcas, campos)).toHaveLength(0);
  });
});

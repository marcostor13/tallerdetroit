import { describe, expect, it } from 'vitest';
import {
  MEASUREMENT_TEMPLATES,
  findMeasurementTemplate,
  templatesDependientesDelMotor,
} from './measurement-templates';
import {
  celdasEsperadas,
  claveDeCelda,
  distribuirPegado,
  resolveGrid,
  type ValoresCapturados,
} from './measurement-grid';
import { resolveColumns, type AppliedSpec, type EngineGridDimensions } from './measurements';

/** Los dos motores de los informes reales (§12.2). */
const MTU_20V: EngineGridDimensions = { cilindros: 20, apoyosBancada: 11, bancos: 2 };
const MTU_16V: EngineGridDimensions = { cilindros: 16, apoyosBancada: 9, bancos: 2 };

const plantilla = (codigo: string) => {
  const t = findMeasurementTemplate(codigo);
  if (!t) throw new Error(`No existe la plantilla ${codigo}`);
  return t;
};

const specEncajeInferior20V: AppliedSpec = {
  nominal: 193.0,
  tolInf: 0,
  tolSup: 0.08,
  unidad: 'mm',
  fuente: 'Informe OT898',
  provisional: true,
};

describe('Plantillas de medición (§12.3)', () => {
  it('están las diez', () => {
    expect(MEASUREMENT_TEMPLATES).toHaveLength(10);
  });

  it('ninguna lleva el número de columnas escrito a mano cuando depende del motor', () => {
    // Es el hallazgo que gobierna F2: un número aquí se queda viejo con el
    // siguiente modelo de motor.
    for (const t of templatesDependientesDelMotor()) {
      expect(t.origenColumnas.tipo).not.toBe('fija');
    }
    expect(templatesDependientesDelMotor()).toHaveLength(7);
  });

  it('cada una declara el parámetro con el que busca su tolerancia', () => {
    for (const t of MEASUREMENT_TEMPLATES) {
      expect(t.parametro).toBeTruthy();
      expect(t.unidad).toBeTruthy();
    }
  });

  describe('dimensiones según el motor (§12.2)', () => {
    it('el muñón de bancada da 11 columnas en el 20V y 9 en el 16V', () => {
      const t = plantilla('muñon_bancada');
      expect(resolveColumns(t.origenColumnas, MTU_20V)).toHaveLength(11);
      expect(resolveColumns(t.origenColumnas, MTU_16V)).toHaveLength(9);
    });

    it('el muñón de biela da 10 y 8', () => {
      const t = plantilla('muñon_biela_a');
      expect(resolveColumns(t.origenColumnas, MTU_20V)).toHaveLength(10);
      expect(resolveColumns(t.origenColumnas, MTU_16V)).toHaveLength(8);
    });

    it('los encajes de camisa cubren los dos bancos en la misma tabla', () => {
      const columnas = resolveColumns(plantilla('encaje_camisa_inferior').origenColumnas, MTU_20V);

      // 10 por banco × 2 bancos. Partirlo en dos grillas obligaría al técnico a
      // saltar entre ellas para capturar lo que en el informe es una sola.
      expect(columnas).toHaveLength(20);
      expect(columnas[0]).toBe('A1');
      expect(columnas[9]).toBe('A10');
      expect(columnas[10]).toBe('B1');
      expect(columnas.at(-1)).toBe('B10');
    });

    it('la coaxialidad rotula los extremos como APOYO, sin añadir columnas', () => {
      const columnas = resolveColumns(plantilla('coaxialidad_cigueñal').origenColumnas, MTU_20V);

      expect(columnas).toHaveLength(11);
      expect(columnas[0]).toBe('APOYO');
      expect(columnas.at(-1)).toBe('APOYO');
      expect(columnas[1]).toBe('2');
    });

    it('las de dimensión fija no cambian con el motor', () => {
      const t = plantilla('piñones_intermedios');
      expect(resolveColumns(t.origenColumnas, MTU_20V)).toEqual(['Piñón A', 'Piñón B']);
      expect(resolveColumns(t.origenColumnas, MTU_16V)).toEqual(['Piñón A', 'Piñón B']);
    });
  });
});

describe('Grilla resuelta', () => {
  it('el túnel de bancada del 20V pide 33 celdas y calcula 11 más', () => {
    const grilla = resolveGrid(plantilla('tunel_bancada'), MTU_20V);

    // a, b1, b2 × 11 apoyos = 33 que se teclean; la ovalidad no se pide.
    expect(grilla.resumen.esperadas).toBe(33);
    expect(celdasEsperadas(plantilla('tunel_bancada'), MTU_20V)).toBe(33);
    expect(grilla.celdas).toHaveLength(44);
    expect(grilla.celdas.filter((c) => c.calculado)).toHaveLength(11);
  });

  it('la ovalidad se calcula y nunca se pide (§12.4.2)', () => {
    const valores: ValoresCapturados = {
      [claveDeCelda('a', '1')]: 171.0,
      [claveDeCelda('b1', '1')]: 171.02,
      [claveDeCelda('b2', '1')]: 171.015,
    };

    const grilla = resolveGrid(plantilla('tunel_bancada'), MTU_20V, valores);
    const ovalidad = grilla.celdas.find((c) => c.fila === 'Ovalidad' && c.columna === '1');

    // Se toma la mayor desviación: la pieza es tan ovalada como su peor eje, y
    // promediar escondería justo el defecto que se busca.
    expect(ovalidad?.valor).toBeCloseTo(0.02, 5);
    expect(ovalidad?.calculado).toBe(true);
  });

  it('sin la lectura de referencia no se inventa la ovalidad', () => {
    const grilla = resolveGrid(plantilla('tunel_bancada'), MTU_20V, {
      [claveDeCelda('b1', '1')]: 171.02,
    });
    expect(grilla.celdas.find((c) => c.fila === 'Ovalidad')?.valor).toBeNull();
  });

  describe('semáforo', () => {
    const conValores = (valores: ValoresCapturados) =>
      resolveGrid(plantilla('encaje_camisa_inferior'), MTU_20V, valores, specEncajeInferior20V);

    it('marca dentro, alerta y fuera de tolerancia', () => {
      const grilla = conValores({
        [claveDeCelda('L', 'A1')]: 193.02,
        [claveDeCelda('T', 'A1')]: 193.075,
        [claveDeCelda('L', 'A2')]: 193.16,
      });

      const estado = (fila: string, col: string) =>
        grilla.celdas.find((c) => c.fila === fila && c.columna === col)?.estado;

      expect(estado('L', 'A1')).toBe('ok');
      expect(estado('T', 'A1')).toBe('alerta');
      expect(estado('L', 'A2')).toBe('fuera');
    });

    it('resume cuántas hay de cada y propone veredicto', () => {
      const grilla = conValores({
        [claveDeCelda('L', 'A1')]: 193.02,
        [claveDeCelda('T', 'A1')]: 193.16,
      });

      expect(grilla.resumen.capturadas).toBe(2);
      expect(grilla.resumen.fueraTolerancia).toBe(1);
      // Con una fuera de tolerancia, la propuesta es cambiar.
      expect(grilla.resumen.veredicto).toBe('cambiar');
    });

    it('sin especificación se captura igual, pero sin semáforo', () => {
      // Las tolerancias de §12.5 siguen provisionales (D1). Evaluar con una
      // inventada es peor que no evaluar.
      const grilla = resolveGrid(plantilla('encaje_camisa_inferior'), MTU_20V, {
        [claveDeCelda('L', 'A1')]: 999,
      });

      expect(grilla.especificacion).toBeNull();
      expect(grilla.celdas.find((c) => c.columna === 'A1')?.estado).toBeNull();
      expect(grilla.resumen.veredicto).toBeNull();
      expect(grilla.resumen.capturadas).toBe(1);
    });

    it('la grilla vacía no propone veredicto', () => {
      // Un «operativo» sin ninguna medición sería una afirmación sin respaldo.
      const grilla = resolveGrid(plantilla('muñon_bancada'), MTU_20V, {}, specEncajeInferior20V);
      expect(grilla.resumen.veredicto).toBeNull();
    });

    it('las calculadas no cuentan como capturadas ni entran en el veredicto', () => {
      const grilla = resolveGrid(
        plantilla('tunel_bancada'),
        MTU_20V,
        {
          [claveDeCelda('a', '1')]: 171.0,
          [claveDeCelda('b1', '1')]: 171.02,
        },
        { ...specEncajeInferior20V, nominal: 171.0, tolSup: 0.025 },
      );

      expect(grilla.resumen.capturadas).toBe(2);
      expect(
        grilla.celdas.find((c) => c.fila === 'Ovalidad' && c.columna === '1')?.estado,
      ).toBeNull();
    });
  });
});

describe('Pegado desde Excel (§12.4.5)', () => {
  const grilla = resolveGrid(plantilla('tunel_bancada'), MTU_20V);
  const forma = {
    filas: grilla.filas,
    filasCalculadas: grilla.filasCalculadas,
    columnas: grilla.columnas,
  };

  it('reparte una fila desde la celda activa', () => {
    const pegado = distribuirPegado('171.000\t171.005\t171.010', forma, {
      fila: 'a',
      columna: '1',
    });

    expect(pegado).toEqual({
      'a|1': 171.0,
      'a|2': 171.005,
      'a|3': 171.01,
    });
  });

  it('reparte un bloque de varias filas', () => {
    const pegado = distribuirPegado('171.000\t171.005\n171.020\t171.025', forma, {
      fila: 'a',
      columna: '1',
    });

    expect(pegado['a|1']).toBe(171.0);
    expect(pegado['b1|2']).toBe(171.025);
  });

  it('salta las filas calculadas: la ovalidad no se pega', () => {
    // a, b1, b2 son editables; Ovalidad no. Un bloque de cuatro filas llena
    // las tres y descarta la cuarta.
    const pegado = distribuirPegado('1\n2\n3\n4', forma, { fila: 'a', columna: '1' });

    expect(Object.keys(pegado).sort()).toEqual(['a|1', 'b1|1', 'b2|1']);
    expect(pegado['Ovalidad|1']).toBeUndefined();
  });

  it('descarta lo que se sale de la grilla en vez de escribir fuera', () => {
    const pegado = distribuirPegado('1\t2\t3', forma, { fila: 'a', columna: '11' });
    // Solo cabe una: la 11 es la última columna.
    expect(Object.keys(pegado)).toEqual(['a|11']);
  });

  it('entiende la coma decimal de un Excel en español', () => {
    const pegado = distribuirPegado('171,000\t171,005', forma, { fila: 'a', columna: '1' });
    expect(pegado['a|1']).toBe(171.0);
    expect(pegado['a|2']).toBe(171.005);
  });

  it('admite el punto y coma y los saltos de Windows', () => {
    const pegado = distribuirPegado('1;2\r\n3;4', forma, { fila: 'a', columna: '1' });
    expect(pegado['a|1']).toBe(1);
    expect(pegado['b1|2']).toBe(4);
  });

  it('ignora las celdas vacías y lo que no sea un número', () => {
    // Una celda en blanco no debe borrar lo que ya hubiera medido.
    const pegado = distribuirPegado('171.000\t\tN/A\t171.030', forma, { fila: 'a', columna: '1' });
    expect(pegado).toEqual({ 'a|1': 171.0, 'a|4': 171.03 });
  });

  it('desde una celda que no existe no escribe nada', () => {
    expect(distribuirPegado('1\t2', forma, { fila: 'inventada', columna: '1' })).toEqual({});
  });
});

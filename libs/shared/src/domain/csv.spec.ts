import { describe, expect, it } from 'vitest';
import { csvToRecords, detectDelimiter, parseCsv } from './csv';

describe('Lectura de CSV', () => {
  describe('separador', () => {
    it('reconoce el punto y coma que escribe Excel en español', () => {
      expect(detectDelimiter('nombre;ruc\nTASA;20100147514')).toBe(';');
    });

    it('reconoce la coma y el tabulador', () => {
      expect(detectDelimiter('nombre,ruc\nTASA,20100147514')).toBe(',');
      expect(detectDelimiter('nombre\truc\nTASA\t20100147514')).toBe('\t');
    });
  });

  describe('comillas', () => {
    it('una coma dentro de comillas no parte la columna', () => {
      // Es el error que no salta: entra en la base y aparece meses después en
      // un informe con la razón social cortada por la mitad.
      const filas = parseCsv('razonSocial,ruc\n"TECNOLOGICA DE ALIMENTOS, S.A.",20100147514');
      expect(filas[1]).toEqual(['TECNOLOGICA DE ALIMENTOS, S.A.', '20100147514']);
    });

    it('las comillas escapadas se conservan', () => {
      const filas = parseCsv('nombre\n"Motor ""MTU"" 20V"');
      expect(filas[1]).toEqual(['Motor "MTU" 20V']);
    });

    it('un salto de línea dentro de una celda no corta la fila', () => {
      const filas = parseCsv('nombre,direccion\nTASA,"Av. Argentina 123\nCallao"');
      expect(filas).toHaveLength(2);
      expect(filas[1]?.[1]).toBe('Av. Argentina 123\nCallao');
    });
  });

  describe('rarezas de Excel', () => {
    it('el BOM no se pega a la primera cabecera', () => {
      // Sin quitarlo queda una columna «U+FEFFrazonSocial» que no casa con nada y
      // el importador da por vacío un campo obligatorio en todas las filas.
      const registros = csvToRecords('﻿razonSocial;ruc\nTASA;20100147514');
      expect(Object.keys(registros[0]?.datos ?? {})).toEqual(['razonSocial', 'ruc']);
    });

    it('la línea vacía del final se ignora', () => {
      expect(csvToRecords('nombre\nA\nB\n\n')).toHaveLength(2);
    });

    it('los saltos de Windows no dejan retornos de carro pegados', () => {
      const registros = csvToRecords('nombre;ruc\r\nTASA;20100147514\r\n');
      expect(registros[0]?.datos['ruc']).toBe('20100147514');
    });
  });

  describe('registros', () => {
    it('usa la primera fila como cabecera y numera desde la 2', () => {
      const registros = csvToRecords('nombre;ruc\nTASA;1\nSPCC;2');
      expect(registros).toEqual([
        { linea: 2, datos: { nombre: 'TASA', ruc: '1' } },
        { linea: 3, datos: { nombre: 'SPCC', ruc: '2' } },
      ]);
    });

    it('la línea es la del archivo: es lo que el usuario ve al corregir', () => {
      const registros = csvToRecords('nombre\nA\nB\nC');
      expect(registros[2]?.linea).toBe(4);
    });

    it('recorta espacios y tolera filas más cortas que la cabecera', () => {
      const registros = csvToRecords('nombre;ruc;ciudad\n  TASA  ;20100147514');
      expect(registros[0]?.datos).toEqual({ nombre: 'TASA', ruc: '20100147514', ciudad: '' });
    });

    it('un archivo vacío no revienta', () => {
      expect(csvToRecords('')).toEqual([]);
    });
  });
});

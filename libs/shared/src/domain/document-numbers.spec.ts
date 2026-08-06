import { describe, expect, it } from 'vitest';
import {
  checkReportNumber,
  checkWorkOrderNumber,
  normalizeDocumentNumber,
  suggestNextNumber,
} from './document-numbers';

describe('Números de documento', () => {
  describe('normalización', () => {
    it('pasa a mayúsculas y quita espacios', () => {
      expect(normalizeDocumentNumber('  lim-tal-000898 ')).toBe('LIM-TAL-000898');
      expect(normalizeDocumentNumber('LIM - TAL - 000898')).toBe('LIM-TAL-000898');
    });

    it('convierte los guiones tipográficos que se cuelan al copiar de Word', () => {
      // Un guion largo hace que el índice único no vea el duplicado.
      expect(normalizeDocumentNumber('LIM–TAL—000898')).toBe('LIM-TAL-000898');
    });

    it('colapsa guiones repetidos y quita los de los extremos', () => {
      expect(normalizeDocumentNumber('-LIM--TAL-000898-')).toBe('LIM-TAL-000898');
    });

    it('dos formas de escribir el mismo número acaban siendo el mismo texto', () => {
      // Es lo único que hace que el índice único sirva de algo.
      expect(normalizeDocumentNumber('lim-tal-000898')).toBe(
        normalizeDocumentNumber('LIM - TAL - 000898'),
      );
    });
  });

  describe('órdenes de trabajo', () => {
    it('acepta los números reales', () => {
      for (const numero of ['LIM-TAL-000898', 'LIM-SCA-001398']) {
        expect(checkWorkOrderNumber(numero).valido).toBe(true);
      }
    });

    it('acepta convenciones que aún no conocemos', () => {
      // D3 sigue sin confirmarse. Rechazar un número legítimo bloquea al
      // técnico frente a algo correcto, que es peor que admitir uno raro.
      expect(checkWorkOrderNumber('AQP-TAL-2026-000012').valido).toBe(true);
      expect(checkWorkOrderNumber('OT-2026-1').valido).toBe(true);
    });

    it('rechaza lo que no puede ser un número bajo ninguna convención', () => {
      expect(checkWorkOrderNumber('').motivo).toMatch(/vacío/);
      expect(checkWorkOrderNumber('LIM/TAL/000898').motivo).toMatch(/letras, números y guiones/);
      expect(checkWorkOrderNumber('000898').motivo).toMatch(/segmentos/);
      expect(checkWorkOrderNumber('LIM-TAL-TALLER').motivo).toMatch(/correlativo/);
      expect(checkWorkOrderNumber('L'.repeat(60)).motivo).toMatch(/40 caracteres/);
    });

    it('devuelve el normalizado aunque el número no valga, para poder mostrarlo', () => {
      expect(checkWorkOrderNumber(' lim-tal ').normalizado).toBe('LIM-TAL');
    });
  });

  describe('informes', () => {
    it('acepta los dos patrones de los informes reales', () => {
      expect(checkReportNumber('ITS-T-E-26-003-0898').valido).toBe(true);
      expect(checkReportNumber('ITS-C-G-25-0001-001398').valido).toBe(true);
    });

    it('exige más segmentos que una orden de trabajo', () => {
      expect(checkReportNumber('LIM-TAL-000898').valido).toBe(false);
    });
  });

  describe('sugerencia del siguiente', () => {
    it('conserva el relleno con ceros', () => {
      expect(suggestNextNumber('LIM-TAL-000898')).toBe('LIM-TAL-000899');
      expect(suggestNextNumber('ITS-T-E-26-003-0898')).toBe('ITS-T-E-26-003-0899');
    });

    it('crece de longitud cuando toca', () => {
      expect(suggestNextNumber('LIM-TAL-999')).toBe('LIM-TAL-1000');
    });

    it('no inventa nada si el número no termina en dígitos', () => {
      // Es una ayuda para teclear menos, no un generador de correlativos:
      // mientras D3 siga abierta nadie puede afirmar cuál es el siguiente.
      expect(suggestNextNumber('LIM-TAL-FINAL')).toBeNull();
      expect(suggestNextNumber('')).toBeNull();
    });
  });
});

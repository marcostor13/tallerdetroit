import { describe, expect, it } from 'vitest';
import { VisibilityRuleError, evaluateVisibility, isVisible } from './visibility';

/** Contexto parecido al de un informe real de motor de camión minero. */
const contexto = {
  equipo: { categoria: 'camion_minero', codigo: 'VQT-130' },
  motor: { tieneCac: true, cilindros: 20, modelo: '20V4000C23' },
  intervencion: { codigo: 'QL4' },
  informe: { tercerizados: [], repuestos: [{ np: '1' }, { np: '2' }], antecedentes: 'Motor…' },
};

describe('Reglas de visibilidad', () => {
  // Las cuatro reglas que aparecen literalmente en §11.3.
  describe('los ejemplos de la especificación', () => {
    it("equipo.categoria == 'grupo_electrogeno' oculta los parámetros ECU en un camión", () => {
      expect(evaluateVisibility("equipo.categoria == 'grupo_electrogeno'", contexto)).toBe(false);
      expect(evaluateVisibility("equipo.categoria == 'camion_minero'", contexto)).toBe(true);
    });

    it('motor.tieneCac == true muestra la prueba hidrostática', () => {
      expect(evaluateVisibility('motor.tieneCac == true', contexto)).toBe(true);
      expect(evaluateVisibility('motor.tieneCac == false', contexto)).toBe(false);
    });

    it("intervencion.codigo in ['QL4','OVERHAUL'] muestra el desmontaje de turbos", () => {
      expect(evaluateVisibility("intervencion.codigo in ['QL4','OVERHAUL']", contexto)).toBe(true);
      expect(evaluateVisibility("intervencion.codigo in ['W6','W6-1']", contexto)).toBe(false);
    });

    it('informe.tercerizados.length > 0 oculta la sección cuando no hay ninguno', () => {
      expect(evaluateVisibility('informe.tercerizados.length > 0', contexto)).toBe(false);
      expect(evaluateVisibility('informe.repuestos.length > 0', contexto)).toBe(true);
    });
  });

  describe('operadores', () => {
    it('compara números', () => {
      expect(evaluateVisibility('motor.cilindros >= 16', contexto)).toBe(true);
      expect(evaluateVisibility('motor.cilindros > 20', contexto)).toBe(false);
      expect(evaluateVisibility('motor.cilindros <= 20', contexto)).toBe(true);
      expect(evaluateVisibility('motor.cilindros < 12', contexto)).toBe(false);
    });

    it('admite != y not in', () => {
      expect(evaluateVisibility("intervencion.codigo != 'W6'", contexto)).toBe(true);
      expect(evaluateVisibility("intervencion.codigo not in ['W6','W6-1']", contexto)).toBe(true);
      expect(evaluateVisibility("intervencion.codigo not in ['QL4']", contexto)).toBe(false);
    });

    it('una ruta a solas se lee como comprobación de veracidad', () => {
      expect(evaluateVisibility('motor.tieneCac', contexto)).toBe(true);
      expect(evaluateVisibility('motor.tieneTurbos', contexto)).toBe(false);
    });

    it('la longitud también funciona sobre texto', () => {
      expect(evaluateVisibility('informe.antecedentes.length > 0', contexto)).toBe(true);
    });
  });

  describe('composición', () => {
    it('encadena con && y con ||', () => {
      expect(evaluateVisibility('motor.tieneCac == true && motor.cilindros == 20', contexto)).toBe(
        true,
      );
      expect(evaluateVisibility('motor.tieneCac == true && motor.cilindros == 16', contexto)).toBe(
        false,
      );
      expect(
        evaluateVisibility("motor.cilindros == 16 || intervencion.codigo == 'QL4'", contexto),
      ).toBe(true);
    });

    it('&& liga más fuerte que ||, como espera quien la escribe', () => {
      // (false && false) || true  →  true.
      // Si || ligara más fuerte sería false && (false || true) → false.
      const regla =
        "motor.cilindros == 16 && motor.tieneCac == false || intervencion.codigo == 'QL4'";
      expect(evaluateVisibility(regla, contexto)).toBe(true);
    });
  });

  describe('robustez', () => {
    it('una ruta que no existe no revienta: simplemente no coincide', () => {
      expect(evaluateVisibility("no.existe.nada == 'x'", contexto)).toBe(false);
      expect(evaluateVisibility('no.existe.nada > 3', contexto)).toBe(false);
    });

    it('la igualdad es estricta: el 20 numérico no es el texto «20»', () => {
      expect(evaluateVisibility("motor.cilindros == '20'", contexto)).toBe(false);
      expect(evaluateVisibility('motor.cilindros == 20', contexto)).toBe(true);
    });

    it('no ejecuta código: una expresión que no sea de la gramática es un error', () => {
      // Con `eval`, esto habría escrito en el contexto global del proceso.
      expect(() => evaluateVisibility("globalThis.comprometido = 'si'", contexto)).toThrow(
        VisibilityRuleError,
      );
      expect((globalThis as Record<string, unknown>)['comprometido']).toBeUndefined();
    });

    it('rechaza literales sin cerrar', () => {
      expect(() => evaluateVisibility("equipo.codigo == 'VQT", contexto)).toThrow(
        VisibilityRuleError,
      );
      expect(() => evaluateVisibility("intervencion.codigo in ['QL4'", contexto)).toThrow(
        VisibilityRuleError,
      );
    });

    it('una coma dentro de un texto no parte la lista', () => {
      const ctx = { equipo: { nombre: 'MOTOR, MTU' } };
      expect(evaluateVisibility("equipo.nombre in ['MOTOR, MTU']", ctx)).toBe(true);
    });
  });

  describe('isVisible', () => {
    it('sin regla, todo se muestra', () => {
      expect(isVisible(undefined, contexto)).toBe(true);
      expect(isVisible(null, contexto)).toBe(true);
      expect(isVisible('   ', contexto)).toBe(true);
    });

    it('una regla rota muestra de más, nunca de menos', () => {
      // Un informe al que le falta una sección se emite incompleto sin que
      // nadie lo note; una sección de sobra se ve y se corrige.
      expect(isVisible('esto no es una regla !!', contexto)).toBe(true);
    });

    it('una regla válida sí decide', () => {
      expect(isVisible("equipo.categoria == 'grupo_electrogeno'", contexto)).toBe(false);
    });
  });
});

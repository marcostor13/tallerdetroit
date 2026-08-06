import { describe, expect, it } from 'vitest';
import {
  composeConclusion,
  proposeConclusions,
  verdictOfBlock,
  verdictOfStates,
  type ResumenDeGrilla,
} from './conclusiones';

const grilla = (veredicto: string | null, fuera = 0): ResumenDeGrilla => ({
  nombre: 'Grilla',
  resumen: { capturadas: 10, alertas: 0, fueraTolerancia: fuera, veredicto: veredicto as never },
});

describe('Veredicto del bloque', () => {
  it('manda el peor de todas sus grillas', () => {
    // Un componente con diez grillas correctas y una fuera de tolerancia no
    // está operativo. Promediar escondería justo lo que el informe documenta.
    expect(verdictOfBlock([grilla('operativo'), grilla('cambiar'), grilla('operativo')])).toBe(
      'cambiar',
    );
    expect(verdictOfBlock([grilla('operativo'), grilla('reparar')])).toBe('reparar');
    expect(verdictOfBlock([grilla('reutilizable'), grilla('operativo')])).toBe('reutilizable');
  });

  it('sin ninguna grilla evaluada no propone nada', () => {
    // «Operativo» porque no hay datos sería afirmar algo que nadie comprobó.
    expect(verdictOfBlock([])).toBeNull();
    expect(verdictOfBlock([grilla(null)])).toBeNull();
  });

  it('también sale de los estados sueltos', () => {
    expect(verdictOfStates(['ok', 'ok', 'fuera'])).toBe('cambiar');
    expect(verdictOfStates(['ok', 'alerta'])).toBe('reparar');
    expect(verdictOfStates([])).toBeNull();
  });
});

describe('Redacción de la conclusión', () => {
  it('reproduce el patrón de los informes reales', () => {
    // «El cigüeñal se encuentra operativo. (Pulir cigüeñal).» — §12.4.4
    expect(composeConclusion('Cigüeñal', 'operativo', 'Pulir cigüeñal')).toBe(
      'El cigüeñal se encuentra operativo. (Pulir cigüeñal).',
    );
  });

  it('concuerda en género y número', () => {
    expect(composeConclusion('Camisa', 'operativo')).toBe('La camisa se encuentra operativa.');
    expect(composeConclusion('Culatas', 'operativo')).toBe('Las culatas se encuentran operativas.');
    expect(composeConclusion('Pistones', 'operativo')).toBe(
      'Los pistones se encuentran operativos.',
    );
    expect(composeConclusion('Cigüeñal', 'operativo')).toBe('El cigüeñal se encuentra operativo.');
  });

  it('los veredictos que no son adjetivos se redactan, no se pegan tal cual', () => {
    // «El cigüeñal se encuentra reparar» no es español, y esto acaba impreso en
    // un documento que lee el cliente.
    expect(composeConclusion('Cigüeñal', 'reparar')).toBe(
      'El cigüeñal se encuentra en condición de reparación.',
    );
    expect(composeConclusion('Camisas', 'cambiar')).toBe(
      'Las camisas se encuentran fuera de servicio.',
    );
    expect(composeConclusion('Biela', 'reutilizable')).toBe('La biela se encuentra reutilizable.');
  });

  it('sin acción no deja el paréntesis vacío', () => {
    expect(composeConclusion('Cigüeñal', 'operativo')).not.toContain('(');
    expect(composeConclusion('Cigüeñal', 'operativo', '   ')).not.toContain('(');
  });
});

describe('Propuestas para el informe', () => {
  const bloque = (
    id: string,
    titulo: string,
    extra: Record<string, unknown> = {},
  ): Parameters<typeof proposeConclusions>[0][number] => ({ id, titulo, ...extra });

  it('propone una por bloque con mediciones evaluadas', () => {
    const propuestas = proposeConclusions([
      bloque('b1', 'Cigüeñal', { mediciones: [grilla('operativo')] }),
      bloque('b2', 'Camisas', { mediciones: [grilla('cambiar', 3)] }),
    ]);

    expect(propuestas).toHaveLength(2);
    expect(propuestas.map((p) => p.componente)).toContain('Cigüeñal');
  });

  it('lo más grave va primero: es lo que el supervisor tiene que leer', () => {
    const propuestas = proposeConclusions([
      bloque('b1', 'Cigüeñal', { mediciones: [grilla('operativo')] }),
      bloque('b2', 'Camisas', { mediciones: [grilla('cambiar', 3)] }),
      bloque('b3', 'Bielas', { mediciones: [grilla('reparar', 1)] }),
    ]);

    expect(propuestas.map((p) => p.veredicto)).toEqual(['cambiar', 'reparar', 'operativo']);
  });

  it('el veredicto escrito a mano manda sobre el propuesto', () => {
    // El técnico ha visto la pieza; la grilla solo mide una cosa de ella.
    const propuestas = proposeConclusions([
      bloque('b1', 'Cigüeñal', { veredicto: 'cambiar', mediciones: [grilla('operativo')] }),
    ]);

    expect(propuestas[0]?.veredicto).toBe('cambiar');
  });

  it('un bloque sin mediciones ni veredicto no aparece', () => {
    const propuestas = proposeConclusions([
      bloque('b1', 'DESMONTAJE DE CULATAS'),
      bloque('b2', 'Cigüeñal', { mediciones: [grilla('operativo')] }),
    ]);

    expect(propuestas).toHaveLength(1);
    expect(propuestas[0]?.bloqueId).toBe('b2');
  });

  it('usa la acción del bloque, y si no la que corresponda al veredicto', () => {
    const propuestas = proposeConclusions(
      [
        bloque('b1', 'Cigüeñal', {
          accionRecomendada: 'Pulir cigüeñal',
          mediciones: [grilla('operativo')],
        }),
        bloque('b2', 'Camisas', { mediciones: [grilla('cambiar', 2)] }),
      ],
      { cambiar: 'Se reemplaza por componente nuevo' },
    );

    const porBloque = new Map(propuestas.map((p) => [p.bloqueId, p]));
    expect(porBloque.get('b1')?.texto).toContain('(Pulir cigüeñal)');
    expect(porBloque.get('b2')?.texto).toContain('(Se reemplaza por componente nuevo)');
  });

  it('prefiere el componente del maestro al título del bloque', () => {
    // El título es texto libre —«DESMONTAJE DE PISTONES»— y no sirve para
    // redactar; el componente sí, y además es lo que enlaza con la analítica.
    const propuestas = proposeConclusions([
      bloque('b1', 'DESMONTAJE DE PISTONES', {
        componente: 'Pistones',
        mediciones: [grilla('cambiar', 1)],
      }),
    ]);

    expect(propuestas[0]?.componente).toBe('Pistones');
    expect(propuestas[0]?.texto).toBe('Los pistones se encuentran fuera de servicio.');
  });

  it('lleva de vuelta al bloque del que salió', () => {
    const propuestas = proposeConclusions([
      bloque('b7', 'Cigüeñal', { mediciones: [grilla('operativo')] }),
    ]);
    expect(propuestas[0]?.bloqueId).toBe('b7');
  });
});

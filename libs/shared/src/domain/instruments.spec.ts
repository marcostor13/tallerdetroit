import { describe, expect, it } from 'vitest';
import {
  DIAS_DE_AVISO_DE_CALIBRACION,
  evaluarCalibracion,
  explicarCalibracion,
  instrumentosPorVencer,
  instrumentosVencidos,
  type InstrumentoUsado,
} from './instruments';

const MICROMETRO: InstrumentoUsado = {
  codigo: 'MEGDPS01',
  denominacion: 'Micrómetro de interiores 150–175 mm',
  serie: '51290323',
  calibracionVence: '2026-09-30',
};

/** El día en que se hizo el trabajo, no el día en que se escribe el informe. */
const SERVICIO = '2026-08-06';

/**
 * Control de calibración (RN-04).
 *
 * Un micrómetro descalibrado no da un error visible: da números creíbles y
 * equivocados, y el informe los presenta con tres decimales como si fueran
 * ciertos. De ahí que la regla bloquee la emisión.
 */
describe('Calibración de instrumentos', () => {
  describe('se juzga contra la fecha del servicio, no contra hoy', () => {
    it('un instrumento vigente en la fecha del trabajo lo está, aunque hoy no', () => {
      const alDia = evaluarCalibracion({ ...MICROMETRO, calibracionVence: '2026-08-20' }, SERVICIO);
      expect(alDia.estado).not.toBe('vencida');

      // El mismo instrumento, juzgado seis meses después, sí está vencido.
      expect(
        evaluarCalibracion({ ...MICROMETRO, calibracionVence: '2026-08-20' }, '2027-01-10').estado,
      ).toBe('vencida');
    });

    it('un trabajo de junio no se invalida por tardar en escribirlo', () => {
      // Calibración hasta el 30 de junio, trabajo del 15: el instrumento estaba
      // en regla. Que el informe se redacte en agosto no cambia lo que pasó en
      // junio, y lo que decide es si bloquea o no.
      const enSuMomento = evaluarCalibracion(
        { ...MICROMETRO, calibracionVence: '2026-06-30' },
        '2026-06-15',
      );
      expect(enSuMomento.estado).not.toBe('vencida');
      expect(
        instrumentosVencidos([{ ...MICROMETRO, calibracionVence: '2026-06-30' }], '2026-06-15'),
      ).toHaveLength(0);
    });
  });

  describe('estados', () => {
    it('el día del vencimiento todavía vale: los certificados van por día', () => {
      const evaluada = evaluarCalibracion({ ...MICROMETRO, calibracionVence: SERVICIO }, SERVICIO);
      expect(evaluada.estado).not.toBe('vencida');
      expect(evaluada.dias).toBe(0);
    });

    it('el día siguiente ya no', () => {
      const evaluada = evaluarCalibracion(
        { ...MICROMETRO, calibracionVence: '2026-08-05' },
        SERVICIO,
      );
      expect(evaluada.estado).toBe('vencida');
      expect(evaluada.dias).toBe(-1);
    });

    it(`avisa con ${DIAS_DE_AVISO_DE_CALIBRACION} días, que es lo que tarda el laboratorio`, () => {
      const justo = evaluarCalibracion({ ...MICROMETRO, calibracionVence: '2026-09-05' }, SERVICIO);
      expect(justo.estado).toBe('por_vencer');
      expect(justo.dias).toBe(30);

      const holgado = evaluarCalibracion(
        { ...MICROMETRO, calibracionVence: '2026-09-06' },
        SERVICIO,
      );
      expect(holgado.estado).toBe('vigente');
    });

    it('sin fecha cargada queda señalado, pero NO bloquea', () => {
      // La mayoría de los instrumentos entran al maestro sin su certificado;
      // bloquear por eso pararía el taller el primer día.
      const evaluada = evaluarCalibracion({ ...MICROMETRO, calibracionVence: null }, SERVICIO);
      expect(evaluada.estado).toBe('sin_datos');
      expect(evaluada.dias).toBeNull();
      expect(
        instrumentosVencidos([{ ...MICROMETRO, calibracionVence: null }], SERVICIO),
      ).toHaveLength(0);
    });

    it('una fecha ilegible se trata como si no hubiera, no como vencida', () => {
      expect(
        evaluarCalibracion({ ...MICROMETRO, calibracionVence: 'el mes que viene' }, SERVICIO)
          .estado,
      ).toBe('sin_datos');
    });

    it('la hora no cuenta: vencer «hoy a las 00:00» no vence a las nueve', () => {
      const evaluada = evaluarCalibracion(
        { ...MICROMETRO, calibracionVence: new Date('2026-08-06T00:00:00Z') },
        new Date('2026-08-06T14:30:00Z'),
      );
      expect(evaluada.estado).not.toBe('vencida');
    });
  });

  describe('qué bloquea y qué no', () => {
    const instrumentos: InstrumentoUsado[] = [
      { codigo: 'MEGDPS01', calibracionVence: '2026-12-31' },
      { codigo: 'MEGDPS02', calibracionVence: '2026-07-01' },
      { codigo: 'MEGDPS03', calibracionVence: '2026-08-20' },
      { codigo: 'MEGDPS04' },
    ];

    it('solo los vencidos impiden emitir', () => {
      const vencidos = instrumentosVencidos(instrumentos, SERVICIO);
      expect(vencidos.map((v) => v.instrumento.codigo)).toEqual(['MEGDPS02']);
    });

    it('los que están por vencer se avisan aparte y no bloquean', () => {
      const porVencer = instrumentosPorVencer(instrumentos, SERVICIO);
      expect(porVencer.map((v) => v.instrumento.codigo)).toEqual(['MEGDPS03']);
    });

    it('sin instrumentos declarados no hay nada que bloquear', () => {
      expect(instrumentosVencidos([], SERVICIO)).toHaveLength(0);
    });
  });

  describe('el aviso dice cuál y qué hacer', () => {
    it('el vencido nombra el instrumento, los días y la salida', () => {
      const texto = explicarCalibracion(
        evaluarCalibracion({ ...MICROMETRO, calibracionVence: '2026-08-01' }, SERVICIO),
      );

      expect(texto).toContain('MEGDPS01');
      expect(texto).toContain('Micrómetro de interiores');
      expect(texto).toContain('5 día(s)');
      expect(texto).toMatch(/Administrador/);
    });

    it('el que está por vencer pide mandarlo a calibrar', () => {
      const texto = explicarCalibracion(
        evaluarCalibracion({ ...MICROMETRO, calibracionVence: '2026-08-20' }, SERVICIO),
      );
      expect(texto).toContain('vence en 14 día(s)');
    });

    it('sin denominación se nombra por su código, no «undefined»', () => {
      const texto = explicarCalibracion(
        evaluarCalibracion({ codigo: 'MEGDPS09', calibracionVence: '2026-01-01' }, SERVICIO),
      );
      expect(texto).toContain('MEGDPS09');
      expect(texto).not.toContain('undefined');
    });
  });
});

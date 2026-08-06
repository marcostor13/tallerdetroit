import { Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GrillaGuardada } from '../../core/api/reports.service';
import { MedicionesBloqueComponent, type CapturaDeGrilla } from './mediciones-bloque.component';

/** MTU 20V4000C23, el motor del OT898: 20 cilindros, 11 apoyos (§12.2). */
const MOTOR_20V = {
  serie: '5282011236',
  modelo: '20V4000C23',
  cilindros: 20,
  apoyosBancada: 11,
  bancos: 2,
};
const MOTOR_16V = {
  serie: '5272012973',
  modelo: '16V4000C21',
  cilindros: 16,
  apoyosBancada: 9,
  bancos: 2,
};

/**
 * Una grilla como la devuelve el servidor tras guardar.
 *
 * Se construye a mano en vez de con `resolveGrid` a propósito: lo que se está
 * probando es que el componente pinte **lo que llegó del backend**, y generarlo
 * con la misma función escondería que estuviera pintando otra cosa.
 */
const grillaGuardada = (parcial: Partial<GrillaGuardada> = {}): GrillaGuardada => ({
  plantilla: 'tunel_bancada',
  nombre: 'Túnel de bancada',
  unidad: 'mm',
  filas: ['a', 'b1', 'b2', 'Ovalidad'],
  columnas: ['1', '2'],
  valores: [{ fila: 'a', columna: '1', valor: 171.01, estado: 'ok', calculado: false }],
  especificacion: {
    nominal: 171.0,
    tolInf: 0,
    tolSup: 0.025,
    unidad: 'mm',
    fuente: 'Informe OT898',
    provisional: true,
  },
  resumen: { capturadas: 1, esperadas: 33, alertas: 0, fueraTolerancia: 0, veredicto: 'operativo' },
  justificacion: null,
  ...parcial,
});

@Component({
  standalone: true,
  imports: [MedicionesBloqueComponent],
  template: `
    <dps-mediciones-bloque
      [grillas]="grillas()"
      [motor]="motor()"
      [soloLectura]="soloLectura()"
      (guardar)="guardadas.push($event)"
      (quitar)="quitadas.push($event)"
    />
  `,
})
class Anfitrion {
  readonly grillas = signal<GrillaGuardada[]>([]);
  readonly motor = signal<Record<string, unknown>>(MOTOR_20V);
  readonly soloLectura = signal(false);
  readonly guardadas: CapturaDeGrilla[] = [];
  readonly quitadas: string[] = [];
}

/**
 * Las tablas dimensionales dentro del informe (E2.3 + E2.4).
 *
 * Aquí no se vuelve a probar la grilla —eso está en `grilla-medicion.component.spec`—
 * sino la costura que faltaba: que las columnas salgan del motor del informe, que
 * capturar no dispare una petición por tecla, y que RN-03 se vea en pantalla.
 */
describe('MedicionesBloqueComponent', () => {
  let fixture: ComponentFixture<Anfitrion>;
  let anfitrion: Anfitrion;

  const texto = (): string => fixture.nativeElement.textContent as string;
  const celdas = (): HTMLInputElement[] => [
    ...fixture.nativeElement.querySelectorAll('input.dps-cell'),
  ];

  const escribir = (indice: number, valor: string) => {
    const celda = celdas()[indice];
    if (!celda) throw new Error(`No hay celda ${indice}`);
    celda.value = valor;
    celda.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  const boton = (rotulo: string): HTMLButtonElement | null =>
    [...fixture.nativeElement.querySelectorAll('button')].find((b) =>
      (b as HTMLButtonElement).textContent?.includes(rotulo),
    ) ?? null;

  beforeEach(async () => {
    vi.useFakeTimers();
    await TestBed.configureTestingModule({ imports: [Anfitrion] }).compileComponents();
    fixture = TestBed.createComponent(Anfitrion);
    anfitrion = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('las columnas salen del motor, no de la configuración (§12.2)', () => {
    it('el muñón de bancada del 20V se pinta con 11 columnas', () => {
      anfitrion.grillas.set([grillaGuardada({ plantilla: 'muñon_bancada' })]);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelectorAll('thead th').length).toBe(12); // 11 + esquina
      expect(celdas().length).toBe(11);
    });

    it('el mismo bloque en un 16V se pinta con 9', () => {
      anfitrion.grillas.set([grillaGuardada({ plantilla: 'muñon_bancada' })]);
      anfitrion.motor.set(MOTOR_16V);
      fixture.detectChanges();

      expect(celdas().length).toBe(9);
    });

    it('sin motor resuelto no se ofrece ninguna tabla, y se dice por qué', () => {
      anfitrion.motor.set({ serie: 'sin resolver' });
      fixture.detectChanges();

      expect(celdas()).toHaveLength(0);
      expect(texto()).toContain('todavía no tiene el motor resuelto');
      expect(boton('Añadir')).toBeNull();
    });
  });

  describe('captura', () => {
    beforeEach(() => {
      anfitrion.grillas.set([grillaGuardada({ plantilla: 'muñon_bancada' })]);
      fixture.detectChanges();
    });

    it('siembra la grilla con lo que devolvió el servidor', () => {
      anfitrion.grillas.set([
        grillaGuardada({
          plantilla: 'muñon_bancada',
          valores: [{ fila: 'Ø', columna: '3', valor: 170.985, estado: 'ok', calculado: false }],
        }),
      ]);
      fixture.detectChanges();

      expect(celdas()[2]?.value).toBe('170.985');
    });

    it('teclear no manda una petición por celda: se agrupan', () => {
      escribir(0, '170.99');
      escribir(1, '170.98');
      escribir(2, '170.97');

      expect(anfitrion.guardadas).toHaveLength(0);

      vi.advanceTimersByTime(1_500);

      expect(anfitrion.guardadas).toHaveLength(1);
      expect(anfitrion.guardadas[0]?.valores).toMatchObject({
        'Ø|1': 170.99,
        'Ø|2': 170.98,
        'Ø|3': 170.97,
      });
    });

    it('mientras hay cambios sin mandar lo dice, y lo deja de decir al mandarlos', () => {
      escribir(0, '170.99');
      expect(texto()).toContain('Sin guardar');

      vi.advanceTimersByTime(1_500);
      fixture.detectChanges();
      expect(texto()).not.toContain('Sin guardar');
    });

    it('añadir una tabla la crea vacía: las columnas y la tolerancia las resuelve el servidor', () => {
      boton('Añadir')?.click();
      fixture.detectChanges();

      expect(anfitrion.guardadas).toHaveLength(1);
      expect(anfitrion.guardadas[0]?.valores).toEqual({});
    });

    it('no se ofrece dos veces la misma tabla', () => {
      const opciones = () =>
        [...fixture.nativeElement.querySelectorAll('option')].map(
          (o) => (o as HTMLOptionElement).value,
        );

      // El bloque ya tiene la de muñón de bancada, así que no se vuelve a ofrecer.
      expect(opciones()).not.toContain('muñon_bancada');
      expect(opciones()).toContain('tunel_bancada');

      anfitrion.grillas.set([
        grillaGuardada({ plantilla: 'muñon_bancada' }),
        grillaGuardada({ plantilla: 'tunel_bancada' }),
      ]);
      fixture.detectChanges();

      expect(opciones()).not.toContain('muñon_bancada');
      expect(opciones()).not.toContain('tunel_bancada');
    });
  });

  describe('RN-03 — fuera de tolerancia sin justificar', () => {
    const conValorFuera = () =>
      grillaGuardada({
        plantilla: 'muñon_bancada',
        resumen: { capturadas: 1, esperadas: 11, alertas: 0, fueraTolerancia: 1 },
      });

    it('con todo dentro de tolerancia no se pide justificación', () => {
      anfitrion.grillas.set([grillaGuardada({ plantilla: 'muñon_bancada' })]);
      fixture.detectChanges();

      expect(texto()).not.toContain('Justificación');
    });

    it('con un valor fuera se pide, y se dice que sin ella no se emite', () => {
      anfitrion.grillas.set([conValorFuera()]);
      fixture.detectChanges();

      expect(texto()).toContain('Justificación de los valores fuera de tolerancia');
      expect(texto()).toContain('Falta justificar para poder emitir');
    });

    it('escrita, deja de reclamarse y viaja al servidor', () => {
      anfitrion.grillas.set([conValorFuera()]);
      fixture.detectChanges();

      const area = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
      area.value = 'Se rectifica el muñón antes del montaje.';
      area.dispatchEvent(new Event('change'));
      fixture.detectChanges();

      expect(anfitrion.guardadas.at(-1)?.justificacion).toBe(
        'Se rectifica el muñón antes del montaje.',
      );

      anfitrion.grillas.set([
        { ...conValorFuera(), justificacion: 'Se rectifica el muñón antes del montaje.' },
      ]);
      fixture.detectChanges();
      expect(texto()).not.toContain('Falta justificar para poder emitir');
    });

    it('la justificación ya escrita no se pierde al seguir capturando', () => {
      anfitrion.grillas.set([{ ...conValorFuera(), justificacion: 'Se rectifica.' }]);
      fixture.detectChanges();

      escribir(0, '170.5');
      vi.advanceTimersByTime(1_500);

      expect(anfitrion.guardadas.at(-1)?.justificacion).toBe('Se rectifica.');
    });
  });

  describe('informe emitido', () => {
    beforeEach(() => {
      anfitrion.grillas.set([grillaGuardada({ plantilla: 'muñon_bancada' })]);
      anfitrion.soloLectura.set(true);
      fixture.detectChanges();
    });

    it('se ve pero no se toca', () => {
      expect(celdas().length).toBe(11);
      expect(celdas().every((c) => c.disabled)).toBe(true);
      expect(boton('Añadir')).toBeNull();
      expect(boton('Quitar')).toBeNull();
    });
  });

  it('quitar una tabla avisa con su nombre, para no borrar la que no era', () => {
    anfitrion.grillas.set([
      grillaGuardada({ plantilla: 'muñon_bancada', nombre: 'Muñón de bancada' }),
    ]);
    fixture.detectChanges();

    const quitar = boton('Quitar');
    expect(quitar?.textContent).toContain('Muñón de bancada');

    quitar?.click();
    expect(anfitrion.quitadas).toEqual(['muñon_bancada']);
  });
});

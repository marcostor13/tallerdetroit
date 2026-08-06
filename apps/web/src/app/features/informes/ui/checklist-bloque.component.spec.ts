import { Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ChecklistCapturado, ChecklistItem } from '@dps/shared';
import { ChecklistBloqueComponent, type ChecklistDelBloque } from './checklist-bloque.component';

const MOTOR_20V = { cilindros: 20, apoyosBancada: 11, bancos: 2 };

const ITEMS: ChecklistItem[] = [
  { clave: 'pistones', denominacion: 'Pistones', grupo: 'bloque', cantidadDerivadaDe: 'cilindros' },
  { clave: 'volante', denominacion: 'Volante', grupo: 'bloque', cantidadEsperada: 1 },
];

const bloque = (capturado: ChecklistCapturado[] = []): ChecklistDelBloque => ({
  clave: 'inventario-desarmado',
  items: ITEMS,
  capturado,
});

@Component({
  standalone: true,
  imports: [ChecklistBloqueComponent],
  template: `
    <dps-checklist-bloque
      [checklist]="checklist()"
      [motor]="motor()"
      [soloLectura]="soloLectura()"
      (capturar)="capturas.push($event)"
    />
  `,
})
class Anfitrion {
  readonly checklist = signal<ChecklistDelBloque | null>(bloque());
  readonly motor = signal<Record<string, unknown>>(MOTOR_20V);
  readonly soloLectura = signal(false);
  readonly capturas: ChecklistCapturado[][] = [];
}

/**
 * Inventario de desarmado (E2.7, D4).
 *
 * Lo que se prueba aquí es lo que el inventario existe para evitar: que algo se
 * dé por bueno sin que nadie lo haya mirado, y que una cantidad que no cuadra
 * pase desapercibida.
 */
describe('ChecklistBloqueComponent', () => {
  let fixture: ComponentFixture<Anfitrion>;
  let anfitrion: Anfitrion;

  const texto = (): string => fixture.nativeElement.textContent as string;

  const selects = (): HTMLSelectElement[] => [...fixture.nativeElement.querySelectorAll('select')];

  const elegir = (indice: number, valor: string) => {
    const select = selects()[indice];
    if (!select) throw new Error(`No hay estado ${indice}`);
    select.value = valor;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };

  const cantidades = (): HTMLInputElement[] =>
    [...fixture.nativeElement.querySelectorAll('input')].filter((i) =>
      (i as HTMLInputElement).getAttribute('aria-label')?.startsWith('Cantidad'),
    ) as HTMLInputElement[];

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Anfitrion] }).compileComponents();
    fixture = TestBed.createComponent(Anfitrion);
    anfitrion = fixture.componentInstance;
    fixture.detectChanges();
  });

  describe('cantidades derivadas del motor (§12.2)', () => {
    it('un 20V espera veinte pistones', () => {
      expect(texto()).toContain('Esperadas 20');
    });

    it('un 16V espera dieciséis, sin tocar el catálogo', () => {
      anfitrion.motor.set({ cilindros: 16, apoyosBancada: 9, bancos: 2 });
      fixture.detectChanges();

      expect(texto()).toContain('Esperadas 16');
      expect(texto()).not.toContain('Esperadas 20');
    });
  });

  describe('sin revisar no es conforme', () => {
    it('un ítem que nadie tocó sale como pendiente, no en blanco', () => {
      expect(texto()).toContain('Pendiente de revisar');
      expect(texto()).toContain('0 / 2 revisados');
    });

    it('volver a «sin revisar» quita el ítem de lo capturado', () => {
      anfitrion.checklist.set(bloque([{ clave: 'volante', estado: 'ok', cantidad: 1 }]));
      fixture.detectChanges();

      elegir(1, '');

      expect(anfitrion.capturas.at(-1)).toEqual([]);
    });
  });

  describe('captura', () => {
    it('marcar conforme propone la cantidad esperada, que es el caso normal', () => {
      elegir(0, 'ok');

      expect(anfitrion.capturas.at(-1)).toEqual([
        { clave: 'pistones', estado: 'ok', cantidad: 20 },
      ]);
    });

    it('anotar una cantidad sin marcar el estado no se pierde', () => {
      const campo = cantidades()[1];
      if (!campo) throw new Error('No hay campo de cantidad');
      campo.value = '1';
      campo.dispatchEvent(new Event('change'));

      expect(anfitrion.capturas.at(-1)).toEqual([{ clave: 'volante', estado: 'ok', cantidad: 1 }]);
    });

    it('lo que falta se registra como falta, no como cero', () => {
      elegir(1, 'falta');

      expect(anfitrion.capturas.at(-1)?.[0]).toMatchObject({
        clave: 'volante',
        estado: 'falta',
      });
    });
  });

  describe('lo que hay que mirar', () => {
    it('diecinueve pistones en un 20V se señalan aunque estén conformes', () => {
      anfitrion.checklist.set(bloque([{ clave: 'pistones', estado: 'ok', cantidad: 19 }]));
      fixture.detectChanges();

      expect(texto()).toContain('la cantidad no cuadra');
      expect(texto()).toContain('1 requieren atención');
    });

    it('lo que requiere atención pide una observación', () => {
      anfitrion.checklist.set(bloque([{ clave: 'volante', estado: 'averiado' }]));
      fixture.detectChanges();

      const observacion = fixture.nativeElement.querySelector(
        'input[aria-label^="Observación"]',
      ) as HTMLInputElement | null;
      expect(observacion).not.toBeNull();
    });

    it('el estado no depende solo del color: lleva icono y texto (WCAG 1.4.1)', () => {
      anfitrion.checklist.set(bloque([{ clave: 'volante', estado: 'falta' }]));
      fixture.detectChanges();

      expect(texto()).toContain('Falta');
      expect(fixture.nativeElement.querySelector('dps-icon')).not.toBeNull();
    });
  });

  describe('sin catálogo', () => {
    it('lo dice en vez de quedarse en blanco', () => {
      anfitrion.checklist.set(null);
      fixture.detectChanges();

      expect(texto()).toContain('No hay ningún catálogo de inventario');
    });
  });

  describe('informe emitido', () => {
    it('se ve pero no se toca', () => {
      anfitrion.soloLectura.set(true);
      fixture.detectChanges();

      expect(selects().every((s) => s.disabled)).toBe(true);
      expect(cantidades().every((c) => c.disabled)).toBe(true);
    });
  });
});

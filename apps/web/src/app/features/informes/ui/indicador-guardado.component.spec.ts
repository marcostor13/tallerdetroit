import { Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EstadoGuardado } from '../informe.store';
import { IndicadorGuardadoComponent } from './indicador-guardado.component';

@Component({
  standalone: true,
  imports: [IndicadorGuardadoComponent],
  template: `<dps-indicador-guardado [estado]="estado()" [guardadoEn]="guardadoEn()" />`,
})
class Anfitrion {
  readonly estado = signal<EstadoGuardado>('limpio');
  readonly guardadoEn = signal<Date | null>(null);
}

/**
 * «Guardado hace X» (UX-01).
 *
 * Lo que tranquiliza al técnico no es un icono sino ver el tiempo transcurrido:
 * si no lo ve, guarda a mano por si acaso, que es justo lo que el autoguardado
 * viene a quitarle de encima.
 */
describe('IndicadorGuardadoComponent', () => {
  let fixture: ComponentFixture<Anfitrion>;
  let anfitrion: Anfitrion;

  /** Solo el rótulo: el icono también aporta texto al `textContent`. */
  const texto = () => (fixture.nativeElement.querySelector('p > span')?.textContent ?? '').trim();

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-06T10:00:00Z'));

    await TestBed.configureTestingModule({ imports: [Anfitrion] }).compileComponents();
    fixture = TestBed.createComponent(Anfitrion);
    anfitrion = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => vi.useRealTimers());

  it('cada estado dice algo distinto y comprensible', () => {
    const casos: [EstadoGuardado, RegExp][] = [
      ['limpio', /Sin cambios/],
      ['pendiente', /Cambios sin guardar/],
      ['guardando', /Guardando/],
      ['error', /Sin conexión/],
    ];

    for (const [estado, esperado] of casos) {
      anfitrion.estado.set(estado);
      fixture.detectChanges();
      expect(texto()).toMatch(esperado);
    }
  });

  it('el error se ve como error, no como un estado más', () => {
    anfitrion.estado.set('error');
    fixture.detectChanges();

    const parrafo: HTMLElement = fixture.nativeElement.querySelector('p');
    expect(parrafo.className).toContain('text-error');
    // Y dice que se reintenta solo: si no, el técnico cree que perdió el trabajo.
    expect(texto()).toMatch(/reintentará/i);
  });

  it('cuenta el tiempo desde el último guardado', () => {
    anfitrion.estado.set('guardado');
    anfitrion.guardadoEn.set(new Date('2026-08-06T10:00:00Z'));
    fixture.detectChanges();
    expect(texto()).toMatch(/ahora mismo/);

    vi.advanceTimersByTime(30_000);
    fixture.detectChanges();
    expect(texto()).toMatch(/hace 30 s/);

    vi.advanceTimersByTime(270_000);
    fixture.detectChanges();
    expect(texto()).toMatch(/hace 5 min/);

    vi.advanceTimersByTime(6_900_000);
    fixture.detectChanges();
    expect(texto()).toMatch(/hace 2 h/);
  });

  it('se refresca solo aunque no pase nada más', () => {
    // Sin el reloj interno, «hace 0 s» se quedaría congelado en pantalla
    // mientras el técnico escribe, y dejaría de significar nada.
    anfitrion.estado.set('guardado');
    anfitrion.guardadoEn.set(new Date('2026-08-06T10:00:00Z'));
    fixture.detectChanges();

    vi.advanceTimersByTime(120_000);
    fixture.detectChanges();

    expect(texto()).toMatch(/hace 2 min/);
  });

  it('sin fecha no inventa un «hace»', () => {
    anfitrion.estado.set('guardado');
    fixture.detectChanges();
    expect(texto()).toBe('Guardado');
  });

  it('lo anuncia sin robar el foco', () => {
    const parrafo: HTMLElement = fixture.nativeElement.querySelector('p');
    expect(parrafo.getAttribute('role')).toBe('status');
    expect(parrafo.getAttribute('aria-live')).toBe('polite');
  });
});

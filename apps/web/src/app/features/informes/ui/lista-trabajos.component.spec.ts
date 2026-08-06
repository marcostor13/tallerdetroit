import { Component, signal, viewChild } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { BloqueInforme } from '../../../core/api/reports.service';
import { ListaTrabajosComponent } from './lista-trabajos.component';

const bloque = (id: string, orden: number, titulo: string): BloqueInforme =>
  ({ id, orden, titulo, clave: 'trabajos', tipo: 'work_task' }) as BloqueInforme;

@Component({
  standalone: true,
  imports: [ListaTrabajosComponent],
  template: `
    <dps-lista-trabajos
      [bloques]="bloques()"
      [soloLectura]="soloLectura()"
      (mover)="movimientos.update((m) => [...m, $event])"
      (quitar)="quitados.update((q) => [...q, $event])"
      (editar)="editados.update((e) => [...e, $event])"
    />
  `,
})
class Anfitrion {
  readonly lista = viewChild.required(ListaTrabajosComponent);
  readonly soloLectura = signal(false);
  readonly bloques = signal<BloqueInforme[]>([
    bloque('a', 1, 'DESMONTAJE DE CULATAS'),
    bloque('b', 2, 'DESMONTAJE DE PISTONES'),
    bloque('c', 3, 'DESMONTAJE DE TURBOS'),
  ]);
  readonly movimientos = signal<{ desde: number; hasta: number }[]>([]);
  readonly quitados = signal<string[]>([]);
  readonly editados = signal<string[]>([]);
}

/**
 * Reordenamiento de bloques.
 *
 * El criterio de F1 es que todo el wizard se complete sin ratón, incluido esto
 * (T2). El arrastre nativo de HTML no es accesible por sí solo, así que la vía
 * de teclado no es un extra: es la que decide si se cumple.
 */
describe('ListaTrabajosComponent', () => {
  let fixture: ComponentFixture<Anfitrion>;
  let anfitrion: Anfitrion;

  const filas = (): HTMLElement[] => [...fixture.nativeElement.querySelectorAll('li[tabindex]')];

  const teclearEn = (indice: number, key: string, ctrlKey = true) => {
    const evento = new KeyboardEvent('keydown', { key, ctrlKey, bubbles: true, cancelable: true });
    filas()[indice]?.dispatchEvent(evento);
    fixture.detectChanges();
    return evento;
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Anfitrion] }).compileComponents();
    fixture = TestBed.createComponent(Anfitrion);
    anfitrion = fixture.componentInstance;
    fixture.detectChanges();
  });

  describe('teclado (T2)', () => {
    it('Control+flechas mueve el bloque', () => {
      teclearEn(1, 'ArrowUp');
      expect(anfitrion.movimientos()).toEqual([{ desde: 1, hasta: 0 }]);

      teclearEn(1, 'ArrowDown');
      expect(anfitrion.movimientos()).toHaveLength(2);
      expect(anfitrion.movimientos()[1]).toEqual({ desde: 1, hasta: 2 });
    });

    it('no se sale de los extremos', () => {
      teclearEn(0, 'ArrowUp');
      teclearEn(2, 'ArrowDown');
      expect(anfitrion.movimientos()).toEqual([]);
    });

    it('las flechas sin Control no mueven nada: son para navegar', () => {
      teclearEn(1, 'ArrowUp', false);
      expect(anfitrion.movimientos()).toEqual([]);
    });

    it('cada fila es alcanzable con Tab y se explica sola', () => {
      const primera = filas()[0];
      expect(primera?.getAttribute('tabindex')).toBe('0');
      // Sin la descripción, quien navega con lector no sabe que se puede mover.
      expect(primera?.getAttribute('aria-describedby')).toBe('dps-ayuda-reordenar');
      expect(fixture.nativeElement.querySelector('#dps-ayuda-reordenar').textContent).toMatch(
        /Control/i,
      );
    });

    it('los botones de subir y bajar llevan etiqueta con el nombre del bloque', () => {
      const botones = [...fixture.nativeElement.querySelectorAll('button[aria-label]')];
      const etiquetas = botones.map((b: HTMLElement) => b.getAttribute('aria-label'));
      expect(etiquetas).toContain('Subir DESMONTAJE DE PISTONES');
      expect(etiquetas).toContain('Bajar DESMONTAJE DE CULATAS');
    });

    it('subir está desactivado en el primero y bajar en el último', () => {
      const subirPrimero: HTMLButtonElement = fixture.nativeElement.querySelector(
        '[aria-label="Subir DESMONTAJE DE CULATAS"]',
      );
      const bajarUltimo: HTMLButtonElement = fixture.nativeElement.querySelector(
        '[aria-label="Bajar DESMONTAJE DE TURBOS"]',
      );
      expect(subirPrimero.disabled).toBe(true);
      expect(bajarUltimo.disabled).toBe(true);
    });
  });

  describe('arrastre', () => {
    // jsdom no implementa `DragEvent`; los manejadores solo miran el tipo, así
    // que un Event normal reproduce lo que hace el navegador.
    const arrastrar = (desde: number, hasta: number) => {
      filas()[desde]?.dispatchEvent(new Event('dragstart', { bubbles: true }));
      filas()[hasta]?.dispatchEvent(new Event('drop', { bubbles: true }));
      fixture.detectChanges();
    };

    it('soltar sobre otra fila produce el mismo movimiento que el teclado', () => {
      arrastrar(2, 0);
      expect(anfitrion.movimientos()).toEqual([{ desde: 2, hasta: 0 }]);
    });

    it('soltar sobre sí mismo no mueve nada', () => {
      arrastrar(1, 1);
      expect(anfitrion.movimientos()).toEqual([]);
    });
  });

  describe('solo lectura', () => {
    it('un informe emitido no ofrece mover ni quitar', () => {
      anfitrion.soloLectura.set(true);
      fixture.detectChanges();

      expect(filas()).toHaveLength(0);
      expect(fixture.nativeElement.querySelectorAll('button[aria-label]')).toHaveLength(0);
      expect(fixture.nativeElement.textContent).toContain('Ver detalle');
    });

    it('el teclado tampoco mueve nada', () => {
      anfitrion.soloLectura.set(true);
      fixture.detectChanges();

      const li = fixture.nativeElement.querySelector('li');
      li?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', ctrlKey: true }));
      expect(anfitrion.movimientos()).toEqual([]);
    });
  });

  it('sin trabajos dice qué hacer, no se queda en blanco', () => {
    anfitrion.bloques.set([]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toMatch(/Añade el primero/);
  });

  it('los ordena por su campo orden, aunque lleguen desordenados', () => {
    anfitrion.bloques.set([bloque('z', 3, 'TERCERO'), bloque('x', 1, 'PRIMERO')]);
    fixture.detectChanges();

    const titulos = [...fixture.nativeElement.querySelectorAll('h3')].map((h: HTMLElement) =>
      h.textContent?.trim(),
    );
    expect(titulos).toEqual(['TERCERO', 'PRIMERO']);
  });

  it('quitar y editar avisan al contenedor', () => {
    fixture.nativeElement
      .querySelector('[aria-label^="Quitar"]')
      ?.dispatchEvent(new Event('click'));
    fixture.detectChanges();
    expect(anfitrion.quitados()).toEqual(['a']);
  });
});

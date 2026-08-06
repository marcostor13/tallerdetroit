import { Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MastersService, type MasterItem } from '../../../core/api/masters.service';
import { AutocompleteComponent } from './autocomplete.component';

/** Anfitrión con filtros cambiables, para poder probar la cascada. */
@Component({
  standalone: true,
  imports: [AutocompleteComponent],
  template: `
    <dps-autocomplete
      coleccion="sites"
      etiqueta="sede"
      campoTexto="nombre"
      [filtros]="filtros()"
      (seleccion)="elegido.set($event)"
      (creado)="creado.set($event)"
    />
  `,
})
class Anfitrion {
  readonly filtros = signal<Record<string, string | null>>({ clienteId: 'c1' });
  readonly elegido = signal<MasterItem | null>(null);
  readonly creado = signal<MasterItem | null>(null);
}

const sede = (id: string, nombre: string): MasterItem => ({ _id: id, nombre }) as MasterItem;

/**
 * El autocompletado sostiene dos criterios de F1: que el wizard se complete solo
 * con teclado (T2) y que el técnico pueda dar de alta una sede sin salir del
 * informe (§13.3.1). Se prueban esos dos, no el aspecto.
 */
describe('AutocompleteComponent', () => {
  let fixture: ComponentFixture<Anfitrion>;
  let anfitrion: Anfitrion;
  let maestros: { search: ReturnType<typeof vi.fn>; createInline: ReturnType<typeof vi.fn> };

  const entrada = (): HTMLInputElement =>
    fixture.nativeElement.querySelector('input[role="combobox"]');

  const opciones = (): HTMLElement[] => [
    ...fixture.nativeElement.querySelectorAll('[role="option"]'),
  ];

  const teclear = async (texto: string) => {
    const input = entrada();
    input.value = texto;
    input.dispatchEvent(new Event('input'));
    // El componente espera a que se deje de escribir antes de consultar.
    await vi.advanceTimersByTimeAsync(400);
    fixture.detectChanges();
  };

  /**
   * Con temporizadores falsos, `whenStable()` no llega a resolverse nunca: se
   * avanza el reloj para dejar correr las promesas pendientes.
   */
  const asentar = async () => {
    await vi.advanceTimersByTimeAsync(50);
    fixture.detectChanges();
  };

  const pulsar = async (key: string) => {
    entrada().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    await asentar();
  };

  beforeEach(async () => {
    vi.useFakeTimers();

    maestros = {
      search: vi.fn().mockResolvedValue({
        total: 2,
        items: [sede('s1', 'TALLER - LIMA'), sede('s2', 'MINA - CUAJONE')],
      }),
      createInline: vi.fn().mockResolvedValue(sede('s9', 'SEDE NUEVA')),
    };

    await TestBed.configureTestingModule({
      imports: [Anfitrion],
      providers: [{ provide: MastersService, useValue: maestros }],
    }).compileComponents();

    fixture = TestBed.createComponent(Anfitrion);
    anfitrion = fixture.componentInstance;
    fixture.detectChanges();
  });

  describe('teclado (T2)', () => {
    it('las flechas recorren la lista y Enter elige', async () => {
      entrada().dispatchEvent(new Event('focus'));
      await vi.advanceTimersByTimeAsync(50);
      fixture.detectChanges();

      await pulsar('ArrowDown');
      await pulsar('Enter');

      expect(anfitrion.elegido()?._id).toBe('s2');
    });

    it('Enter no envía el formulario que hay alrededor', async () => {
      entrada().dispatchEvent(new Event('focus'));
      await vi.advanceTimersByTimeAsync(50);
      fixture.detectChanges();

      const evento = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      });
      entrada().dispatchEvent(evento);

      // En un wizard, un Enter descuidado dispararía el paso siguiente en vez
      // de elegir de la lista.
      expect(evento.defaultPrevented).toBe(true);
    });

    it('Escape cierra la lista sin elegir nada', async () => {
      entrada().dispatchEvent(new Event('focus'));
      await vi.advanceTimersByTimeAsync(50);
      fixture.detectChanges();
      expect(opciones().length).toBeGreaterThan(0);

      await pulsar('Escape');

      expect(opciones()).toHaveLength(0);
      expect(anfitrion.elegido()).toBeNull();
    });

    it('anuncia el estado a los lectores de pantalla', async () => {
      entrada().dispatchEvent(new Event('focus'));
      await vi.advanceTimersByTimeAsync(50);
      fixture.detectChanges();

      // Quien no ve la lista no se enteraría de que aparecieron resultados.
      const estado: HTMLElement = fixture.nativeElement.querySelector('[role="status"]');
      expect(estado.textContent).toMatch(/2 resultados/);
      expect(entrada().getAttribute('aria-expanded')).toBe('true');
      expect(entrada().getAttribute('aria-activedescendant')).toBeTruthy();
    });
  });

  describe('alta inline (§13.3.1)', () => {
    it('ofrece crear lo escrito cuando no hay coincidencia exacta', async () => {
      maestros.search.mockResolvedValue({ total: 0, items: [] });
      await teclear('SEDE NUEVA');

      const crear = opciones().at(-1);
      expect(crear?.textContent).toMatch(/Crear «SEDE NUEVA»/);
    });

    it('no ofrece crear lo que ya existe con ese nombre exacto', async () => {
      await teclear('TALLER - LIMA');
      expect(fixture.nativeElement.textContent).not.toMatch(/Crear «TALLER - LIMA»/);
    });

    it('crea y deja el valor seleccionado, sin salir del formulario', async () => {
      maestros.search.mockResolvedValue({ total: 0, items: [] });
      await teclear('SEDE NUEVA');

      await pulsar('ArrowDown');
      await pulsar('Enter');
      await asentar();

      // El alta arrastra los filtros de la cascada: una sede es de un cliente.
      expect(maestros.createInline).toHaveBeenCalledWith('sites', {
        nombre: 'SEDE NUEVA',
        clienteId: 'c1',
      });
      expect(anfitrion.creado()?._id).toBe('s9');
      expect(anfitrion.elegido()?._id).toBe('s9');
    });
  });

  describe('cascada', () => {
    it('pasa los filtros al servidor', async () => {
      await teclear('taller');
      expect(maestros.search).toHaveBeenCalledWith('sites', {
        q: 'taller',
        limit: 20,
        filtros: { clienteId: 'c1' },
      });
    });

    it('al cambiar de cliente se descarta la sede elegida', async () => {
      entrada().dispatchEvent(new Event('focus'));
      await vi.advanceTimersByTimeAsync(50);
      fixture.detectChanges();
      await pulsar('Enter');
      expect(entrada().value).toBe('TALLER - LIMA');

      // La sede del cliente anterior ya no pertenece a este informe; dejarla
      // puesta produciría un informe que se contradice a sí mismo.
      anfitrion.filtros.set({ clienteId: 'c2' });
      fixture.detectChanges();
      await asentar();

      expect(entrada().value).toBe('');
    });
  });

  describe('robustez', () => {
    it('una respuesta que llega tarde no pisa a la búsqueda posterior', async () => {
      // Se teclea rápido: la primera consulta vuelve después de la segunda.
      let resolverPrimera: (v: unknown) => void = () => undefined;
      maestros.search
        .mockImplementationOnce(
          () =>
            new Promise((r: (v: unknown) => void) => {
              resolverPrimera = r;
            }),
        )
        .mockResolvedValueOnce({ total: 1, items: [sede('s3', 'RESULTADO BUENO')] });

      await teclear('tal');
      await teclear('taller');

      resolverPrimera({ total: 1, items: [sede('s0', 'RESULTADO VIEJO')] });
      await asentar();

      expect(fixture.nativeElement.textContent).toContain('RESULTADO BUENO');
      expect(fixture.nativeElement.textContent).not.toContain('RESULTADO VIEJO');
    });

    it('si falla la búsqueda no se queda con resultados viejos', async () => {
      await teclear('taller');
      maestros.search.mockRejectedValueOnce(new Error('sin red'));
      await teclear('otra cosa');

      expect(fixture.nativeElement.textContent).toContain('No hay coincidencias');
    });
  });
});

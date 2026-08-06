import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MastersService } from '../../core/api/masters.service';
import { ReportsService, type ResumenInforme } from '../../core/api/reports.service';
import { BandejaPage } from './bandeja.page';

const informe = (numero: string, estado: string): ResumenInforme =>
  ({
    _id: numero,
    numeroInforme: numero,
    numeroOt: 'LIM-TAL-000746',
    estado,
    cliente: { nombre: 'SPCC. TOQUEPALA' },
    updatedAt: '2026-06-20T10:00:00.000Z',
  }) as ResumenInforme;

/**
 * Bandeja e historial (E1.8).
 *
 * Se comprueban las dos cosas que la hacen usable: que los filtros lleguen al
 * servidor y que el listado exista en las dos formas —tabla y tarjetas—, porque
 * la misma tabla a 360 px obliga a desplazarse en dos ejes para leer una fila.
 */
describe('BandejaPage', () => {
  let fixture: ComponentFixture<BandejaPage>;
  let api: { list: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  let navegar: ReturnType<typeof vi.fn>;

  const texto = () => fixture.nativeElement.textContent ?? '';

  const crear = async () => {
    await TestBed.compileComponents();
    fixture = TestBed.createComponent(BandejaPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(() => {
    api = {
      list: vi.fn().mockResolvedValue({
        total: 2,
        items: [informe('ITS-1', 'borrador'), informe('ITS-2', 'emitido')],
      }),
      create: vi.fn().mockResolvedValue({ _id: 'nuevo' }),
    };
    TestBed.configureTestingModule({
      imports: [BandejaPage],
      providers: [
        // Router de verdad: `ActivatedRoute` se deriva de su estado, así que
        // sustituirlo dejaría sin resolver los `routerLink` de la plantilla.
        // Lo que se intercepta es solo `navigate`.
        provideRouter([]),
        { provide: ReportsService, useValue: api },
        { provide: MastersService, useValue: { search: vi.fn().mockResolvedValue({ items: [] }) } },
      ],
    });

    navegar = vi.fn().mockResolvedValue(true);
    vi.spyOn(TestBed.inject(Router), 'navigate').mockImplementation(
      navegar as unknown as Router['navigate'],
    );
  });

  it('lista los informes al entrar', async () => {
    await crear();
    expect(api.list).toHaveBeenCalled();
    expect(texto()).toContain('ITS-1');
    expect(texto()).toContain('SPCC. TOQUEPALA');
  });

  it('sale en tabla y en tarjetas, no en una tabla con scroll lateral', async () => {
    await crear();

    // Cada informe aparece dos veces en el DOM, una por disposición; el CSS
    // decide cuál se ve. Es lo que evita el scroll en dos ejes a 360 px (T3).
    expect(fixture.nativeElement.querySelectorAll('table tbody tr')).toHaveLength(2);
    expect(fixture.nativeElement.querySelectorAll('ul[role="list"] li')).toHaveLength(2);
  });

  it('la tabla se explica a un lector de pantalla', async () => {
    await crear();
    expect(fixture.nativeElement.querySelector('caption')).toBeTruthy();
    expect(fixture.nativeElement.querySelectorAll('th[scope="col"]').length).toBeGreaterThan(0);
  });

  it('el filtro de estado llega al servidor', async () => {
    await crear();

    const select: HTMLSelectElement = fixture.nativeElement.querySelector('select');
    select.value = 'emitido';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    expect(api.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ estado: 'emitido' }) as Record<string, unknown>,
    );
  });

  it('sin resultados lo dice, no deja la pantalla en blanco', async () => {
    api.list.mockResolvedValue({ total: 0, items: [] });
    await crear();
    expect(texto()).toMatch(/No hay informes/);
  });

  describe('alta', () => {
    it('el formulario no aparece hasta que se pide', async () => {
      await crear();
      expect(fixture.nativeElement.querySelector('#dps-nuevo-informe')).toBeNull();

      fixture.nativeElement.querySelector('header button').dispatchEvent(new Event('click'));
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('#dps-nuevo-informe')).toBeTruthy();
    });

    it('crea el borrador y entra a editarlo', async () => {
      await crear();
      fixture.nativeElement.querySelector('header button').dispatchEvent(new Event('click'));
      fixture.detectChanges();

      const input: HTMLInputElement = fixture.nativeElement.querySelector(
        '#dps-nuevo-informe input',
      );
      input.value = 'ITS-T-E-26-003-0899';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      fixture.nativeElement.querySelector('#dps-nuevo-informe').dispatchEvent(new Event('submit'));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(api.create).toHaveBeenCalledWith({ numeroInforme: 'ITS-T-E-26-003-0899' });
      expect(navegar).toHaveBeenCalledWith(['/informes', 'nuevo']);
    });

    it('un número duplicado se explica en el propio campo', async () => {
      api.create.mockRejectedValue({ error: { detail: 'Ya existe un informe con ese número.' } });
      await crear();

      fixture.nativeElement.querySelector('header button').dispatchEvent(new Event('click'));
      fixture.detectChanges();

      const input: HTMLInputElement = fixture.nativeElement.querySelector(
        '#dps-nuevo-informe input',
      );
      input.value = 'ITS-REPETIDO';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      fixture.nativeElement.querySelector('#dps-nuevo-informe').dispatchEvent(new Event('submit'));
      await fixture.whenStable();
      fixture.detectChanges();

      // Un cuadro de diálogo del navegador no tendría dónde poner esto.
      expect(texto()).toContain('Ya existe un informe con ese número.');
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(navegar).toHaveBeenCalledTimes(0);
    });

    it('no crea nada con el campo vacío', async () => {
      await crear();
      fixture.nativeElement.querySelector('header button').dispatchEvent(new Event('click'));
      fixture.detectChanges();

      const boton: HTMLButtonElement = fixture.nativeElement.querySelector(
        '#dps-nuevo-informe button[type="submit"]',
      );
      expect(boton.disabled).toBe(true);
    });
  });

  it('la fecha sale en formato peruano y el hueco vacío como raya', async () => {
    await crear();
    const pagina = fixture.componentInstance as unknown as {
      fecha: (iso?: string | null) => string;
    };
    expect(pagina.fecha(null)).toBe('—');
    expect(pagina.fecha('2026-06-20T10:00:00.000Z')).toMatch(/2026/);
  });
});

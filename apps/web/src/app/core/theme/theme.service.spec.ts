import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeService } from './theme.service';

/**
 * Requisito de `especificaciones.md`: tema claro u oscuro según el navegador,
 * y además un switch en la cabecera que lo sobrescriba.
 */
describe('ThemeService', () => {
  let systemPrefersDark = false;
  let changeHandler: ((e: { matches: boolean }) => void) | null = null;

  function setup(stored: string | null, prefersDark: boolean) {
    systemPrefersDark = prefersDark;
    changeHandler = null;

    localStorage.clear();
    if (stored) localStorage.setItem('dps-theme', stored);
    document.documentElement.removeAttribute('data-theme');

    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('dark') ? systemPrefersDark : false,
        media: query,
        addEventListener: (_: string, handler: (e: { matches: boolean }) => void) => {
          changeHandler = handler;
        },
        removeEventListener: () => undefined,
      })),
    );

    TestBed.configureTestingModule({});
    return TestBed.inject(ThemeService);
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  it('sin preferencia guardada sigue al sistema en oscuro', () => {
    const theme = setup(null, true);
    expect(theme.mode()).toBe('system');
    expect(theme.resolved()).toBe('dark');
    expect(theme.isDark()).toBe(true);
  });

  it('sin preferencia guardada sigue al sistema en claro', () => {
    const theme = setup(null, false);
    expect(theme.resolved()).toBe('light');
  });

  it('la elección explícita del usuario gana sobre el sistema', () => {
    const theme = setup('light', true);
    expect(theme.mode()).toBe('light');
    expect(theme.resolved()).toBe('light');
  });

  it('persiste la elección y la refleja en data-theme', () => {
    const theme = setup(null, false);
    theme.set('dark');
    TestBed.tick();

    expect(localStorage.getItem('dps-theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('toggle alterna respecto al tema resuelto, no al modo', () => {
    const theme = setup(null, true); // system => dark
    theme.toggle();
    expect(theme.mode()).toBe('light');

    theme.toggle();
    expect(theme.mode()).toBe('dark');
  });

  it('en modo system reacciona a un cambio en caliente del sistema', () => {
    const theme = setup(null, false);
    expect(theme.resolved()).toBe('light');

    changeHandler?.({ matches: true });
    expect(theme.resolved()).toBe('dark');
  });

  it('en modo explícito ignora los cambios del sistema', () => {
    const theme = setup('light', false);
    changeHandler?.({ matches: true });
    expect(theme.resolved()).toBe('light');
  });

  it('un valor corrupto en localStorage cae a system', () => {
    const theme = setup('azul', true);
    expect(theme.mode()).toBe('system');
    expect(theme.resolved()).toBe('dark');
  });

  it('actualiza el theme-color de la barra del navegador', () => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    document.head.appendChild(meta);

    const theme = setup(null, false);
    theme.set('dark');
    TestBed.tick();
    expect(meta.getAttribute('content')).toBe('#131313');

    theme.set('light');
    TestBed.tick();
    expect(meta.getAttribute('content')).toBe('#F9F9F9');

    meta.remove();
  });
});

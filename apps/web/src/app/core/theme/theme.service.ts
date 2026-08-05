import { DOCUMENT } from '@angular/common';
import { Injectable, computed, effect, inject, signal } from '@angular/core';

/**
 * Modo de tema elegido por el usuario.
 * `system` sigue la preferencia del navegador/SO en tiempo real.
 */
export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'dps-theme';
const THEME_COLOR_LIGHT = '#F9F9F9';
const THEME_COLOR_DARK = '#131313';

/**
 * Requisito de `especificaciones.md`:
 * "La plataforma debe tener la funcionalidad de light o dark según el navegador,
 *  y también tener un switch en el header."
 *
 * La resolución inicial ocurre en el script inline de `index.html` para evitar el
 * destello de tema claro; este servicio toma el relevo una vez arranca Angular.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);

  /** Modo elegido: 'light' | 'dark' | 'system'. */
  readonly mode = signal<ThemeMode>(this.readStoredMode());

  /** Preferencia actual del sistema; se actualiza si el usuario la cambia en caliente. */
  private readonly systemPrefersDark = signal(this.querySystemPrefersDark());

  /** Tema efectivamente aplicado, ya resuelto. */
  readonly resolved = computed<'light' | 'dark'>(() => {
    const mode = this.mode();
    if (mode === 'system') return this.systemPrefersDark() ? 'dark' : 'light';
    return mode;
  });

  readonly isDark = computed(() => this.resolved() === 'dark');

  constructor() {
    this.watchSystemPreference();

    effect(() => {
      const mode = this.mode();
      const dark = this.isDark();

      this.document.documentElement.setAttribute('data-theme', mode);

      const meta = this.document.querySelector('meta[name="theme-color"]');
      meta?.setAttribute('content', dark ? THEME_COLOR_DARK : THEME_COLOR_LIGHT);

      try {
        localStorage.setItem(STORAGE_KEY, mode);
      } catch {
        // Modo privado o almacenamiento lleno: el tema simplemente no persiste.
      }
    });
  }

  set(mode: ThemeMode): void {
    this.mode.set(mode);
  }

  /** Alterna claro ↔ oscuro partiendo del tema actualmente resuelto. */
  toggle(): void {
    this.mode.set(this.isDark() ? 'light' : 'dark');
  }

  private readStoredMode(): ThemeMode {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
    } catch {
      /* sin acceso a localStorage */
    }
    return 'system';
  }

  private querySystemPrefersDark(): boolean {
    return this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  }

  private watchSystemPreference(): void {
    const mql = this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)');
    mql?.addEventListener('change', (event) => this.systemPrefersDark.set(event.matches));
  }
}

import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ThemeService, type ThemeMode } from '../../../core/theme/theme.service';

interface ThemeOption {
  readonly value: ThemeMode;
  readonly icon: string;
  readonly label: string;
}

/**
 * Switch de tema tri-estado del header (requisito de `especificaciones.md`).
 * Implementado como `radiogroup` para que sea navegable y anunciable.
 */
@Component({
  selector: 'dps-theme-toggle',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      role="radiogroup"
      aria-label="Tema de la interfaz"
      class="inline-flex items-center gap-0.5 rounded border border-subtle bg-surface-container-low p-0.5"
    >
      @for (option of options; track option.value) {
        <button
          type="button"
          role="radio"
          [attr.aria-checked]="theme.mode() === option.value"
          [attr.aria-label]="option.label"
          [title]="option.label"
          (click)="theme.set(option.value)"
          class="flex h-9 w-9 items-center justify-center rounded-sm transition-colors"
          [class.bg-surface-container-high]="theme.mode() === option.value"
          [class.text-primary]="theme.mode() === option.value"
          [class.text-secondary]="theme.mode() !== option.value"
        >
          <span
            class="material-symbols-outlined text-[20px]"
            [class.is-filled]="theme.mode() === option.value"
            aria-hidden="true"
            >{{ option.icon }}</span
          >
        </button>
      }
    </div>
  `,
})
export class ThemeToggleComponent {
  protected readonly theme = inject(ThemeService);

  protected readonly options: readonly ThemeOption[] = [
    { value: 'light', icon: 'light_mode', label: 'Tema claro' },
    { value: 'system', icon: 'brightness_auto', label: 'Seguir al sistema' },
    { value: 'dark', icon: 'dark_mode', label: 'Tema oscuro' },
  ];
}

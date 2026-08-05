import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ThemeService } from '../../../core/theme/theme.service';

/**
 * Marca de Detroit Power System.
 *
 * `lockup` = logotipo completo (login, cabecera desktop, documentos).
 * `isotipo` = solo el engranaje (cabecera móvil, espacios reducidos).
 *
 * El lockup es el único caso en que el tema cambia el archivo y no solo el color:
 * el wordmark es tinta casi negra y sobre fondo oscuro necesita su versión clara.
 */
@Component({
  selector: 'dps-logo',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (variant() === 'isotipo') {
      <img
        src="brand/isotipo.svg"
        [alt]="alt()"
        [style.height.px]="height()"
        class="w-auto"
        decoding="async"
      />
    } @else {
      <img
        [src]="lockupSrc()"
        [srcset]="lockupSrcset()"
        [alt]="alt()"
        [style.height.px]="height()"
        class="w-auto"
        decoding="async"
      />
    }
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        align-items: center;
      }
    `,
  ],
})
export class LogoComponent {
  private readonly theme = inject(ThemeService);

  readonly variant = input<'lockup' | 'isotipo'>('lockup');
  readonly height = input(32);
  readonly alt = input('Detroit Power System Perú');

  protected readonly lockupSrc = computed(() =>
    this.theme.isDark() ? 'brand/logo-detroit-dark.png' : 'brand/logo-detroit.png',
  );

  protected readonly lockupSrcset = computed(() => {
    const base = this.theme.isDark() ? 'brand/logo-detroit-dark' : 'brand/logo-detroit';
    return `${base}.png 1x, ${base}@3x.png 3x`;
  });
}

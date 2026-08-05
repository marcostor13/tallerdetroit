import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Icono de Material Symbols, autoalojado.
 *
 * Accesibilidad: si el icono transmite significado por sí solo hay que pasarle
 * `label`; si acompaña a un texto que ya lo explica, se deja vacío y el icono
 * queda oculto para lectores de pantalla.
 */
@Component({
  selector: 'dps-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="material-symbols-outlined"
      [class.is-filled]="filled()"
      [style.font-size.px]="size()"
      [style.width.px]="size()"
      [style.height.px]="size()"
      [attr.role]="label() ? 'img' : null"
      [attr.aria-label]="label() || null"
      [attr.aria-hidden]="label() ? null : 'true'"
      >{{ name() }}</span
    >
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
    `,
  ],
})
export class IconComponent {
  readonly name = input.required<string>();
  readonly size = input(24);
  readonly filled = input(false);
  /** Texto alternativo. Vacío = icono decorativo. */
  readonly label = input('');
}

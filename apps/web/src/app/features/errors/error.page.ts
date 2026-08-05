import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../shared/ui/icon/icon.component';

/**
 * Página de error genérica. Los estados vacíos y de error se resuelven, no se
 * dejan para después: una pantalla sin ellos no está terminada (§7.9).
 */
@Component({
  selector: 'dps-error-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent],
  template: `
    <div
      class="flex min-h-[60dvh] flex-col items-center justify-center gap-6 px-margin-mobile text-center"
    >
      <dps-icon [name]="icon()" [size]="64" class="text-outline" />

      <div class="flex flex-col gap-2">
        <p class="font-mono text-label-sm uppercase tracking-widest text-gray-medium">
          Error {{ code() }}
        </p>
        <h1 class="font-headline text-headline-lg-mobile text-on-surface">{{ title() }}</h1>
        <p class="max-w-measure text-body-md text-secondary">{{ message() }}</p>
      </div>

      <a routerLink="/inicio" class="dps-btn dps-btn--secondary">
        <dps-icon name="arrow_back" [size]="20" />
        Volver al inicio
      </a>
    </div>
  `,
})
export class ErrorPage {
  readonly code = input('404');
  readonly title = input('Página no encontrada');
  readonly message = input(
    'La dirección que abriste no existe o cambió de sitio. Revisa el enlace o vuelve al inicio.',
  );
  readonly icon = input('search_off');
}

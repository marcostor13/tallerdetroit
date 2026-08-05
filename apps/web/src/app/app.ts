import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from './core/theme/theme.service';

@Component({
  selector: 'dps-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class App {
  // Instanciar el servicio aquí deja el tema aplicado desde el primer render.
  // La resolución inicial ya ocurrió en el script inline de index.html.
  private readonly theme = inject(ThemeService);
}

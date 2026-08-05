import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ConnectionService } from '../../../core/connection/connection.service';
import { IconComponent } from '../icon/icon.component';

/**
 * Chip permanente de estado de conexión (§18).
 * `aria-live="polite"` para que un lector de pantalla anuncie la caída de red
 * sin robar el foco al usuario que está capturando datos.
 */
@Component({
  selector: 'dps-connection-chip',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <span
      class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-label-sm uppercase"
      [class]="
        connection.online()
          ? 'border-subtle bg-surface-container-low text-secondary'
          : 'border-warning bg-warning-container text-on-warning-container'
      "
      aria-live="polite"
    >
      <dps-icon
        [name]="connection.online() ? 'cloud_done' : 'cloud_off'"
        [size]="16"
        [filled]="!connection.online()"
      />
      <span>{{ connection.label() }}</span>
    </span>
  `,
})
export class ConnectionChipComponent {
  protected readonly connection = inject(ConnectionService);
}

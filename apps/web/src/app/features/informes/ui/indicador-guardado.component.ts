import {
  ChangeDetectionStrategy,
  Component,
  type OnDestroy,
  computed,
  input,
  signal,
} from '@angular/core';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import type { EstadoGuardado } from '../informe.store';

/**
 * «Guardado hace X» (UX-01).
 *
 * El técnico tiene que poder confiar en que no está perdiendo trabajo sin
 * pulsar nada. Un icono a secas no basta: lo que tranquiliza es ver el tiempo
 * transcurrido, y por eso se refresca solo cada diez segundos aunque no pase
 * nada más.
 */
@Component({
  selector: 'dps-indicador-guardado',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <p
      class="flex items-center gap-1.5 text-body-sm"
      [class.text-secondary]="estado() !== 'error'"
      [class.text-error]="estado() === 'error'"
      role="status"
      aria-live="polite"
    >
      <dps-icon
        [name]="icono()"
        [size]="16"
        [class.animate-spin]="estado() === 'guardando'"
        aria-hidden="true"
      />
      <span>{{ texto() }}</span>
    </p>
  `,
})
export class IndicadorGuardadoComponent implements OnDestroy {
  readonly estado = input.required<EstadoGuardado>();
  readonly guardadoEn = input<Date | null>(null);

  /** Marca el paso del tiempo para que «hace X» no se quede congelado. */
  private readonly ahora = signal(Date.now());
  private readonly reloj = setInterval(() => this.ahora.set(Date.now()), 10_000);

  protected readonly icono = computed(() => {
    switch (this.estado()) {
      case 'guardando':
        return 'progress_activity';
      case 'error':
        return 'cloud_off';
      case 'pendiente':
        return 'edit';
      default:
        return 'cloud_done';
    }
  });

  protected readonly texto = computed(() => {
    switch (this.estado()) {
      case 'guardando':
        return 'Guardando…';
      case 'pendiente':
        return 'Cambios sin guardar';
      case 'error':
        return 'Sin conexión. Se reintentará solo.';
      case 'guardado': {
        const cuando = this.guardadoEn();
        return cuando ? `Guardado ${this.hace(cuando)}` : 'Guardado';
      }
      default:
        return 'Sin cambios';
    }
  });

  ngOnDestroy(): void {
    clearInterval(this.reloj);
  }

  private hace(cuando: Date): string {
    const segundos = Math.max(0, Math.round((this.ahora() - cuando.getTime()) / 1000));
    if (segundos < 10) return 'ahora mismo';
    if (segundos < 60) return `hace ${segundos} s`;

    const minutos = Math.round(segundos / 60);
    if (minutos < 60) return `hace ${minutos} min`;

    const horas = Math.round(minutos / 60);
    return `hace ${horas} h`;
  }
}

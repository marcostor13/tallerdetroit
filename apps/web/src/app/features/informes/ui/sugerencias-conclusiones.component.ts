import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import type { ConclusionPropuesta } from '@dps/shared';
import { ReportsService } from '../../../core/api/reports.service';
import { IconComponent } from '../../../shared/ui/icon/icon.component';

/**
 * Conclusiones propuestas desde las mediciones (E2.5, §12.4.4).
 *
 * Es una propuesta, no una conclusión: se añade a lo escrito y desde ahí se
 * edita o se borra. Lo que ahorra es redactar catorce frases casi iguales a
 * mano, que es de donde salen las erratas y las omisiones del formato actual.
 *
 * Por eso el botón dice «Añadir» y no «Aplicar», y por eso nunca sustituye lo
 * que el técnico ya escribió: el que ha visto la pieza es él, y la grilla solo
 * mide una cosa de ella.
 */
@Component({
  selector: 'dps-sugerencias-conclusiones',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    @if (propuestas().length || frecuentes().length) {
      <section
        class="flex flex-col gap-3 rounded-lg border border-subtle bg-surface-container-low p-3"
        aria-labelledby="dps-sugerencias-titulo"
      >
        <h4 id="dps-sugerencias-titulo" class="text-title-sm">Propuestas desde las mediciones</h4>

        @if (propuestas().length) {
          <ul class="flex flex-col gap-2" role="list">
            @for (propuesta of propuestas(); track propuesta.bloqueId + propuesta.componente) {
              <li class="flex flex-wrap items-start justify-between gap-2">
                <span class="max-w-[68ch] text-body-sm">
                  {{ propuesta.texto }}
                  @if (propuesta.fueraTolerancia > 0) {
                    <span class="ml-2 font-mono text-label-sm text-error">
                      {{ propuesta.fueraTolerancia }} fuera de tolerancia
                    </span>
                  }
                </span>

                @if (!soloLectura()) {
                  <button
                    type="button"
                    class="dps-btn dps-btn--tertiary"
                    (click)="anadir.emit(propuesta.texto)"
                  >
                    <dps-icon name="add" [size]="16" aria-hidden="true" />
                    Añadir
                  </button>
                }
              </li>
            }
          </ul>
        } @else {
          <p class="text-body-sm text-secondary">
            Todavía no hay mediciones ni veredictos de los que proponer conclusiones.
          </p>
        }

        <!--
          La mejor biblioteca de frases es la que ya existe: lo que el propio
          taller ha escrito en informes emitidos (UX-09). El maestro curado llega
          con E3.10; esto da valor desde el primer informe.
        -->
        @if (frecuentes().length && !soloLectura()) {
          <div class="flex flex-col gap-2">
            <p class="font-mono text-label-sm uppercase text-secondary">Frases ya usadas</p>
            <ul class="flex flex-wrap gap-2" role="list">
              @for (frase of frecuentes(); track frase.texto) {
                <li>
                  <button type="button" class="dps-chip" (click)="anadir.emit(frase.texto)">
                    {{ frase.texto }}
                    <span class="ml-1 font-mono text-label-sm text-secondary">
                      {{ frase.usos }}
                    </span>
                  </button>
                </li>
              }
            </ul>
          </div>
        }
      </section>
    }
  `,
})
export class SugerenciasConclusionesComponent {
  private readonly api = inject(ReportsService);

  readonly informeId = input.required<string>();
  readonly soloLectura = input(false);

  /** Texto elegido. El editor decide dónde ponerlo. */
  readonly anadir = output<string>();

  protected readonly propuestas = signal<ConclusionPropuesta[]>([]);
  protected readonly frecuentes = signal<{ texto: string; usos: number }[]>([]);

  constructor() {
    queueMicrotask(() => void this.cargar());
  }

  /** Recarga las propuestas. El editor la llama al llegar al paso. */
  async cargar(): Promise<void> {
    try {
      const { propuestas, frecuentes } = await this.api.conclusionesSugeridas(this.informeId());
      this.propuestas.set(propuestas);
      this.frecuentes.set(frecuentes);
    } catch {
      // Que no haya propuestas no puede impedir escribir las conclusiones a
      // mano, que es como se han escrito hasta hoy.
      this.propuestas.set([]);
      this.frecuentes.set([]);
    }
  }
}

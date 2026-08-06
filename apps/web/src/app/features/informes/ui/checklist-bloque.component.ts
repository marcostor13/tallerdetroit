import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  CHECKLIST_STATES,
  CHECKLIST_STATE_LABEL,
  resolveChecklist,
  type ChecklistCapturado,
  type ChecklistItem,
  type ChecklistState,
  type FilaDeChecklist,
} from '@dps/shared';
import { IconComponent } from '../../../shared/ui/icon/icon.component';

/** Inventario tal como vive dentro del bloque del informe. */
export interface ChecklistDelBloque {
  readonly clave?: string | null;
  readonly items?: ChecklistItem[];
  readonly capturado?: ChecklistCapturado[];
}

/** Icono de cada estado. El color nunca va solo (WCAG 1.4.1). */
const ICONO: Record<ChecklistState, string> = {
  ok: 'check_circle',
  falta: 'error',
  averiado: 'warning',
  no_aplica: 'remove',
};

/**
 * Inventario de desarmado (E2.7, decisión D4).
 *
 * Es una sección del informe, no un documento aparte: sale en el mismo PDF,
 * comparte número y recorre la misma aprobación. Como documento independiente
 * se firmaría en un sitio y el informe en otro, y acabarían contando cosas
 * distintas del mismo motor.
 *
 * Dos cosas que la pantalla tiene que dejar claras:
 *
 * · **Sin revisar no es conforme.** Un ítem que nadie ha tocado se muestra como
 *   pendiente, no en blanco. En blanco parece conforme, y dar por bueno lo que
 *   nadie miró es justo lo que el inventario existe para evitar.
 *
 * · **La cantidad esperada sale del motor.** Un 20V lleva veinte pistones y un
 *   16V dieciséis; el catálogo no puede llevar el número escrito (§12.2).
 */
@Component({
  selector: 'dps-checklist-bloque',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <section class="flex flex-col gap-3" aria-labelledby="dps-checklist-titulo">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h4 id="dps-checklist-titulo" class="text-title-sm">Inventario de desarmado</h4>
        <p class="font-mono text-label-sm text-secondary">
          {{ resuelto().resumen.capturados }} / {{ resuelto().resumen.total }} revisados
          @if (resuelto().resumen.requierenAtencion > 0) {
            <span class="ml-3 text-error">
              {{ resuelto().resumen.requierenAtencion }} requieren atención
            </span>
          }
        </p>
      </div>

      @if (!resuelto().filas.length) {
        <p class="flex items-start gap-2 text-body-sm text-secondary" role="status">
          <dps-icon name="info" [size]="16" class="mt-0.5 shrink-0" aria-hidden="true" />
          No hay ningún catálogo de inventario cargado para este motor. Se da de alta en el maestro
          de checklists.
        </p>
      } @else {
        <!--
          Lista de filas, no tabla con scroll: a 360 px una tabla de cinco
          columnas obliga a desplazarse en dos ejes con el motor delante (T3).
        -->
        <ul class="flex flex-col gap-2" role="list">
          @for (fila of resuelto().filas; track fila.clave) {
            <li
              class="flex flex-col gap-2 rounded border p-3"
              [class.border-subtle]="!fila.requiereAtencion"
              [class.border-error]="fila.requiereAtencion"
            >
              <div class="flex flex-wrap items-baseline justify-between gap-2">
                <span class="text-body-md">
                  {{ fila.denominacion }}
                  @if (fila.grupo) {
                    <span class="ml-2 font-mono text-label-sm text-secondary">{{
                      fila.grupo
                    }}</span>
                  }
                </span>

                @if (fila.cantidadEsperadaResuelta !== null) {
                  <span class="font-mono text-label-sm text-secondary">
                    Esperadas {{ fila.cantidadEsperadaResuelta }}
                  </span>
                }
              </div>

              <div class="flex flex-wrap items-end gap-3">
                <label class="flex flex-col gap-1">
                  <span class="font-mono text-label-sm uppercase text-secondary"> Cómo llegó </span>
                  <select
                    class="dps-input"
                    [attr.aria-label]="'Estado de ' + fila.denominacion"
                    [disabled]="soloLectura()"
                    [value]="fila.estado ?? ''"
                    (change)="cambiarEstado(fila, $event)"
                  >
                    <option value="">Sin revisar</option>
                    @for (estado of estados; track estado) {
                      <option [value]="estado">{{ etiqueta(estado) }}</option>
                    }
                  </select>
                </label>

                <label class="flex flex-col gap-1">
                  <span class="font-mono text-label-sm uppercase text-secondary">Cantidad</span>
                  <input
                    class="dps-input w-24 text-right font-mono tabular-nums"
                    type="text"
                    inputmode="numeric"
                    [attr.aria-label]="'Cantidad encontrada de ' + fila.denominacion"
                    [disabled]="soloLectura()"
                    [value]="fila.cantidad ?? ''"
                    (change)="cambiarCantidad(fila, $event)"
                  />
                </label>

                @if (fila.estado) {
                  <p class="flex items-center gap-1 pb-2 text-body-sm">
                    <dps-icon [name]="icono(fila.estado)" [size]="16" aria-hidden="true" />
                    <span [class.text-error]="fila.requiereAtencion">
                      {{ etiqueta(fila.estado) }}
                      @if (fila.requiereAtencion && fila.estado === 'ok') {
                        — la cantidad no cuadra
                      }
                    </span>
                  </p>
                } @else {
                  <p class="pb-2 text-body-sm text-secondary">Pendiente de revisar</p>
                }
              </div>

              @if (fila.requiereAtencion) {
                <label class="flex flex-col gap-1">
                  <span class="font-mono text-label-sm uppercase text-secondary">
                    Observación
                  </span>
                  <input
                    class="dps-input"
                    [attr.aria-label]="'Observación sobre ' + fila.denominacion"
                    [disabled]="soloLectura()"
                    [value]="fila.observacion ?? ''"
                    (change)="cambiarObservacion(fila, $event)"
                  />
                </label>
              }
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class ChecklistBloqueComponent {
  readonly checklist = input<ChecklistDelBloque | null>(null);
  /** El motor del informe: de él salen las cantidades esperadas (§12.2). */
  readonly motor = input<Record<string, unknown>>({});
  readonly soloLectura = input(false);

  /** Lo capturado completo. El servidor reemplaza el bloque entero. */
  readonly capturar = output<ChecklistCapturado[]>();

  protected readonly estados = CHECKLIST_STATES;

  protected readonly resuelto = computed(() =>
    resolveChecklist(this.checklist()?.items ?? [], this.checklist()?.capturado ?? [], {
      cilindros: Number(this.motor()['cilindros']) || undefined,
      apoyosBancada: Number(this.motor()['apoyosBancada']) || undefined,
      bancos: Number(this.motor()['bancos']) || undefined,
    }),
  );

  protected etiqueta(estado: ChecklistState): string {
    return CHECKLIST_STATE_LABEL[estado];
  }

  protected icono(estado: ChecklistState): string {
    return ICONO[estado];
  }

  protected cambiarEstado(fila: FilaDeChecklist, evento: Event): void {
    const valor = (evento.target as HTMLSelectElement).value;

    if (!valor) {
      // Volver a «sin revisar» quita el ítem de lo capturado: dejarlo con
      // estado nulo lo contaría como revisado y no lo está.
      this.emitir(this.capturado().filter((c) => c.clave !== fila.clave));
      return;
    }

    // La cantidad esperada se propone al marcar conforme: el caso normal es que
    // estén todas, y hacer teclear veinte veces «20» es de donde salen los
    // errores de digitación.
    const cantidad =
      fila.cantidad ?? (valor === 'ok' ? fila.cantidadEsperadaResuelta : null) ?? null;

    this.actualizar(fila.clave, { estado: valor as ChecklistState, cantidad });
  }

  protected cambiarCantidad(fila: FilaDeChecklist, evento: Event): void {
    const bruto = (evento.target as HTMLInputElement).value.trim();
    const cantidad = bruto === '' ? null : Number(bruto);
    if (cantidad !== null && !Number.isFinite(cantidad)) return;

    // Anotar una cantidad sin haber marcado el estado no puede perderse: se
    // guarda como conforme, que es lo que significa contar y encontrar.
    this.actualizar(fila.clave, { estado: fila.estado ?? 'ok', cantidad });
  }

  protected cambiarObservacion(fila: FilaDeChecklist, evento: Event): void {
    const observacion = (evento.target as HTMLInputElement).value.trim();
    this.actualizar(fila.clave, { estado: fila.estado ?? 'ok', observacion: observacion || null });
  }

  private capturado(): ChecklistCapturado[] {
    return [...(this.checklist()?.capturado ?? [])];
  }

  private actualizar(clave: string, cambios: Partial<ChecklistCapturado>): void {
    const actual = this.capturado();
    const indice = actual.findIndex((c) => c.clave === clave);
    const base: ChecklistCapturado = actual[indice] ?? { clave, estado: 'ok' };
    const siguiente = { ...base, ...cambios, clave };

    if (indice >= 0) actual[indice] = siguiente;
    else actual.push(siguiente);

    this.emitir(actual);
  }

  private emitir(capturado: ChecklistCapturado[]): void {
    if (this.soloLectura()) return;
    this.capturar.emit(capturado);
  }
}

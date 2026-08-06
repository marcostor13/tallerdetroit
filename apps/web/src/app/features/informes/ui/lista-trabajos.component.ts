import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  input,
  output,
  signal,
  viewChildren,
} from '@angular/core';
import type { BloqueInforme } from '../../../core/api/reports.service';
import { IconComponent } from '../../../shared/ui/icon/icon.component';

/**
 * Los bloques de trabajo, reordenables.
 *
 * Se puede arrastrar con el ratón **y** mover con el teclado, y no como cortesía:
 * el criterio de F1 es que todo el wizard se complete sin ratón, incluido el
 * reordenamiento (T2). El arrastre nativo de HTML no es accesible por sí solo,
 * así que ambas vías terminan llamando a lo mismo.
 *
 * Sin librerías: el arrastre usa la API `draggable` del navegador.
 */
@Component({
  selector: 'dps-lista-trabajos',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <p class="sr-only" id="dps-ayuda-reordenar">
      Usa Control con las flechas arriba y abajo para mover el bloque de posición.
    </p>

    <ul class="flex flex-col gap-3" role="list">
      @for (bloque of bloques(); track bloque.id; let i = $index) {
        <li
          #fila
          class="dps-card flex flex-col gap-3 p-4"
          [class.opacity-50]="arrastrando() === i"
          [attr.draggable]="!soloLectura()"
          [attr.aria-roledescription]="soloLectura() ? null : 'Bloque reordenable'"
          [attr.aria-describedby]="soloLectura() ? null : 'dps-ayuda-reordenar'"
          [attr.tabindex]="soloLectura() ? null : 0"
          (dragstart)="empezarArrastre(i)"
          (dragover)="$event.preventDefault()"
          (drop)="soltar(i)"
          (dragend)="arrastrando.set(null)"
          (keydown)="alTeclear($event, i)"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <p class="font-mono text-label-sm uppercase tracking-[0.05em] text-secondary">
                {{ i + 1 }} de {{ bloques().length }}
              </p>
              <h3 class="truncate text-title-sm">{{ bloque.titulo || 'Sin título' }}</h3>
            </div>

            @if (!soloLectura()) {
              <div class="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  class="dps-btn-icon"
                  [disabled]="i === 0"
                  [attr.aria-label]="'Subir ' + (bloque.titulo || 'el bloque')"
                  (click)="mover.emit({ desde: i, hasta: i - 1 })"
                >
                  <dps-icon name="arrow_upward" [size]="18" />
                </button>
                <button
                  type="button"
                  class="dps-btn-icon"
                  [disabled]="i === bloques().length - 1"
                  [attr.aria-label]="'Bajar ' + (bloque.titulo || 'el bloque')"
                  (click)="mover.emit({ desde: i, hasta: i + 1 })"
                >
                  <dps-icon name="arrow_downward" [size]="18" />
                </button>
                <button
                  type="button"
                  class="dps-btn-icon text-error"
                  [attr.aria-label]="'Quitar ' + (bloque.titulo || 'el bloque')"
                  (click)="quitar.emit(bloque.id)"
                >
                  <dps-icon name="delete" [size]="18" />
                </button>
              </div>
            }
          </div>

          @if (bloque.texto) {
            <p class="line-clamp-3 text-body-md text-secondary">{{ bloque.texto }}</p>
          }

          <div class="flex flex-wrap items-center gap-3 text-body-sm text-secondary">
            @if (bloque.fotos; as fotos) {
              @if (fotos.length) {
                <span class="flex items-center gap-1">
                  <dps-icon name="photo_library" [size]="16" aria-hidden="true" />
                  {{ fotos.length }} foto(s)
                </span>
              }
            }
            @if (bloque.veredicto) {
              <span class="dps-chip">{{ bloque.veredicto }}</span>
            }
          </div>

          <button type="button" class="dps-btn-text self-start" (click)="editar.emit(bloque.id)">
            {{ soloLectura() ? 'Ver detalle' : 'Editar bloque' }}
          </button>
        </li>
      } @empty {
        <li class="dps-card p-6 text-center text-body-md text-secondary">
          Todavía no hay trabajos. Añade el primero para empezar.
        </li>
      }
    </ul>
  `,
})
export class ListaTrabajosComponent {
  readonly bloques = input.required<BloqueInforme[]>();
  readonly soloLectura = input(false);

  readonly mover = output<{ desde: number; hasta: number }>();
  readonly quitar = output<string>();
  readonly editar = output<string>();

  protected readonly arrastrando = signal<number | null>(null);
  private readonly filas = viewChildren<ElementRef<HTMLElement>>('fila');

  protected empezarArrastre(indice: number): void {
    if (this.soloLectura()) return;
    this.arrastrando.set(indice);
  }

  protected soltar(indice: number): void {
    const desde = this.arrastrando();
    this.arrastrando.set(null);
    if (desde !== null && desde !== indice) this.mover.emit({ desde, hasta: indice });
  }

  protected alTeclear(evento: KeyboardEvent, indice: number): void {
    if (this.soloLectura() || !evento.ctrlKey) return;

    const destino =
      evento.key === 'ArrowUp' ? indice - 1 : evento.key === 'ArrowDown' ? indice + 1 : null;

    if (destino === null || destino < 0 || destino >= this.bloques().length) return;

    evento.preventDefault();
    this.mover.emit({ desde: indice, hasta: destino });
  }

  /**
   * Devuelve el foco al bloque en su posición nueva.
   *
   * Sin esto, mover con el teclado deja el foco donde estaba y la siguiente
   * pulsación actúa sobre otro bloque, con lo que reordenar sin ratón sería
   * inservible en la práctica.
   */
  enfocarFila(indice: number): void {
    queueMicrotask(() => this.filas()[indice]?.nativeElement.focus());
  }
}

import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { comentariosDeBloque, resumirRevision, type ComentarioDeRevision } from '@dps/shared';
import { IconComponent } from '../../../shared/ui/icon/icon.component';

/** Bloque del informe, con lo justo para rotular su comentario. */
export interface BloqueComentable {
  readonly id: string;
  readonly titulo?: string | null;
  readonly clave: string;
}

export interface NuevoComentario {
  readonly bloqueId: string | null;
  readonly texto: string;
}

/**
 * Revisión colaborativa del informe (E3.2, UX-08).
 *
 * Un comentario va **anclado a un bloque**, y por eso lo primero que se elige
 * al escribirlo es a cuál. «Corregir la medición» sin decir cuál obliga al
 * técnico a repasar catorce trabajos para adivinar a qué se refería el
 * supervisor, que es lo que pasa hoy con los correos.
 *
 * Nada se borra: un comentario se marca resuelto, y se puede reabrir. Si se
 * pudiera borrar, la observación incómoda desaparecería justo antes de aprobar
 * y el informe diría que nunca hubo nada que corregir.
 *
 * Todo es operable por teclado y los cambios se anuncian por `aria-live`: quien
 * revisa con lector de pantalla tiene que enterarse de que su comentario se
 * registró, y de que el contador de abiertos bajó (T2).
 */
@Component({
  selector: 'dps-revision-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <section class="flex flex-col gap-4" aria-labelledby="dps-revision-titulo">
      <header class="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="dps-revision-titulo" class="text-title-md">Revisión</h2>
        <p class="font-mono text-label-sm text-secondary" role="status" aria-live="polite">
          {{ resumen().abiertos }} abierto(s) · {{ resumen().resueltos }} resuelto(s)
        </p>
      </header>

      @if (resumen().abiertos > 0 && !puedeAprobarse()) {
        <p
          class="flex items-start gap-2 rounded border border-subtle bg-warning-container p-3 text-body-sm"
        >
          <dps-icon name="error_outline" [size]="18" class="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            No se puede aprobar mientras queden observaciones abiertas: el informe saldría señalado
            y aprobado a la vez.
          </span>
        </p>
      }

      @if (!puedeComentar()) {
        <p class="text-body-sm text-secondary">Solo lectura: no tienes permiso para comentar.</p>
      } @else {
        <form class="flex flex-col gap-3" (submit)="enviar($event)">
          <label class="flex flex-col gap-1">
            <span class="font-mono text-label-sm uppercase text-secondary">Sobre qué bloque</span>
            <select class="dps-input" [value]="bloqueElegido()" (change)="elegirBloque($event)">
              <option value="">Comentario general del informe</option>
              @for (bloque of bloques(); track bloque.id) {
                <option [value]="bloque.id">{{ bloque.titulo || bloque.clave }}</option>
              }
            </select>
          </label>

          <label class="flex flex-col gap-1">
            <span class="font-mono text-label-sm uppercase text-secondary"
              >Qué hay que corregir</span
            >
            <textarea
              class="dps-input min-h-24 resize-y py-2"
              [value]="texto()"
              (input)="escribir($event)"
              placeholder="El encaje de la camisa 7 está fuera y no lleva justificación."
            ></textarea>
          </label>

          <button
            type="submit"
            class="dps-btn dps-btn--secondary self-start"
            [disabled]="!texto().trim()"
          >
            <dps-icon name="add_comment" [size]="18" aria-hidden="true" />
            Añadir comentario
          </button>
        </form>
      }

      @if (comentarios().length) {
        <ul class="flex flex-col gap-3" role="list">
          @for (comentario of ordenados(); track comentario.id) {
            <li
              class="flex flex-col gap-2 rounded border p-3"
              [class.border-subtle]="comentario.resuelto"
              [class.border-error]="!comentario.resuelto"
            >
              <div class="flex flex-wrap items-baseline justify-between gap-2">
                <span class="font-mono text-label-sm uppercase text-secondary">
                  {{ tituloDe(comentario.bloqueId) }}
                </span>
                <span class="flex items-center gap-1 font-mono text-label-sm">
                  <dps-icon
                    [name]="comentario.resuelto ? 'check_circle' : 'error_outline'"
                    [size]="14"
                    aria-hidden="true"
                  />
                  {{ comentario.resuelto ? 'Resuelto' : 'Abierto' }}
                </span>
              </div>

              <p class="max-w-[68ch] text-body-md">{{ comentario.texto }}</p>

              <div class="flex flex-wrap items-center justify-between gap-2">
                <span class="font-mono text-label-sm text-secondary">
                  {{ comentario.autorNombre }}
                </span>

                @if (puedeComentar()) {
                  <button
                    type="button"
                    class="dps-btn dps-btn--tertiary"
                    (click)="resolver.emit({ id: comentario.id, resuelto: !comentario.resuelto })"
                  >
                    {{ comentario.resuelto ? 'Reabrir' : 'Marcar resuelto' }}
                  </button>
                }
              </div>
            </li>
          }
        </ul>
      } @else {
        <p class="text-body-sm text-secondary">
          Todavía no hay comentarios. Los que se escriban aquí van anclados a su bloque y el técnico
          los ve junto a lo que tiene que corregir.
        </p>
      }
    </section>
  `,
})
export class RevisionPanelComponent {
  readonly comentarios = input<readonly ComentarioDeRevision[]>([]);
  readonly bloques = input<readonly BloqueComentable[]>([]);
  readonly puedeComentar = input(false);

  readonly comentar = output<NuevoComentario>();
  readonly resolver = output<{ id: string; resuelto: boolean }>();

  protected readonly texto = signal('');
  protected readonly bloqueElegido = signal('');

  protected readonly resumen = computed(() => resumirRevision([...this.comentarios()]));
  protected readonly puedeAprobarse = computed(() => this.resumen().abiertos === 0);

  /**
   * Los abiertos primero.
   *
   * Es lo que hay que atender; enterrarlos bajo los resueltos convertiría la
   * lista en un archivo en vez de en una lista de tareas.
   */
  protected readonly ordenados = computed(() =>
    [...this.comentarios()].sort((a, b) => Number(a.resuelto) - Number(b.resuelto)),
  );

  protected tituloDe(bloqueId: string | null): string {
    if (!bloqueId) return 'General';
    const bloque = this.bloques().find((b) => b.id === bloqueId);
    return bloque?.titulo || bloque?.clave || 'Bloque eliminado';
  }

  /** Cuántos comentarios abiertos tiene un bloque. Lo usa el editor. */
  abiertosDe(bloqueId: string): number {
    return comentariosDeBloque([...this.comentarios()], bloqueId).filter((c) => !c.resuelto).length;
  }

  protected escribir(evento: Event): void {
    this.texto.set((evento.target as HTMLTextAreaElement).value);
  }

  protected elegirBloque(evento: Event): void {
    this.bloqueElegido.set((evento.target as HTMLSelectElement).value);
  }

  protected enviar(evento: Event): void {
    evento.preventDefault();
    const texto = this.texto().trim();
    if (!texto) return;

    this.comentar.emit({ bloqueId: this.bloqueElegido() || null, texto });
    this.texto.set('');
  }
}

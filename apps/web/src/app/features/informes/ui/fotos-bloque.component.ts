import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import type { FotoInforme } from '../../../core/api/reports.service';
import { FotosService } from '../../../core/api/fotos.service';
import { IconComponent } from '../../../shared/ui/icon/icon.component';

/**
 * Fotografías de un bloque de trabajo (E1.6).
 *
 * El número de figura llega calculado del servidor y aquí solo se muestra: si
 * se guardara, se quedaría viejo en cuanto el técnico moviera un bloque, que es
 * exactamente el defecto del Word (RN-06).
 *
 * El pie es obligatorio para emitir, así que se marca en cuanto falta en vez de
 * esperar al último paso: corregir cuarenta pies al final es lo que hace que
 * nadie los escriba.
 */
@Component({
  selector: 'dps-fotos-bloque',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="flex flex-col gap-3">
      @if (fotos().length) {
        <ul class="grid grid-cols-1 gap-3 sm:grid-cols-2" role="list">
          @for (foto of fotos(); track foto.id) {
            <li class="dps-card flex flex-col gap-2 p-3">
              <div class="flex items-start justify-between gap-2">
                <span class="font-mono text-label-sm text-secondary">
                  {{ foto.numeroFigura ? 'Fig.' + etiqueta(foto.numeroFigura) : 'Sin numerar' }}
                </span>
                @if (!soloLectura()) {
                  <button
                    type="button"
                    class="dps-btn-icon text-error"
                    [attr.aria-label]="'Quitar la fotografía ' + (foto.caption || '')"
                    (click)="quitar.emit(foto.id)"
                  >
                    <dps-icon name="delete" [size]="18" />
                  </button>
                }
              </div>

              @if (urls()[foto.s3Key]; as src) {
                <img
                  [src]="src"
                  [alt]="foto.caption || 'Fotografía del informe'"
                  class="h-36 w-full rounded object-cover"
                />
              } @else {
                <div class="flex h-36 items-center justify-center rounded bg-surface-variant">
                  <dps-icon name="image" [size]="24" class="text-secondary" aria-hidden="true" />
                </div>
              }

              <label class="flex flex-col gap-1">
                <span class="font-mono text-label-sm uppercase tracking-[0.05em] text-secondary">
                  Pie de figura
                </span>
                <input
                  class="dps-input"
                  [disabled]="soloLectura()"
                  [value]="foto.caption ?? ''"
                  [attr.aria-invalid]="!foto.caption?.trim() || null"
                  (change)="cambiarPie(foto.id, $event)"
                />
                @if (!foto.caption?.trim()) {
                  <span class="text-body-sm text-error" role="alert">
                    Sin pie, esta figura no dice nada en el informe.
                  </span>
                }
              </label>
            </li>
          }
        </ul>
      }

      @if (!soloLectura()) {
        <label class="dps-btn dps-btn--secondary cursor-pointer self-start">
          <dps-icon name="add_a_photo" [size]="18" aria-hidden="true" />
          {{ subiendo() ? 'Subiendo… ' + progreso() : 'Añadir fotografías' }}
          <input
            type="file"
            class="sr-only"
            accept="image/*"
            multiple
            [disabled]="subiendo()"
            (change)="subir($event)"
          />
        </label>
      }

      @if (error(); as mensaje) {
        <p class="text-body-sm text-error" role="alert">{{ mensaje }}</p>
      }
    </div>
  `,
})
export class FotosBloqueComponent {
  private readonly servicio = inject(FotosService);

  readonly informeId = input.required<string>();
  readonly fotos = input.required<FotoInforme[]>();
  readonly soloLectura = input(false);

  readonly agregadas = output<FotoInforme[]>();
  readonly quitar = output<string>();
  readonly piePorFoto = output<{ id: string; caption: string }>();

  protected readonly urls = signal<Record<string, string>>({});
  protected readonly subiendo = signal(false);
  protected readonly progreso = signal('');
  protected readonly error = signal<string | null>(null);

  protected etiqueta(numero: number): string {
    return String(numero).padStart(2, '0');
  }

  protected cambiarPie(id: string, evento: Event): void {
    this.piePorFoto.emit({ id, caption: (evento.target as HTMLInputElement).value });
  }

  /**
   * Sube en serie y no en paralelo.
   *
   * Cuarenta y cinco subidas simultáneas desde la conexión de un taller minero
   * se estorban entre sí y acaban tardando más que hacerlas una a una, además
   * de impedir mostrar un avance honesto.
   */
  protected async subir(evento: Event): Promise<void> {
    const entrada = evento.target as HTMLInputElement;
    const archivos = [...(entrada.files ?? [])];
    entrada.value = '';
    if (!archivos.length) return;

    this.subiendo.set(true);
    this.error.set(null);

    const nuevas: FotoInforme[] = [];

    try {
      for (const [i, archivo] of archivos.entries()) {
        this.progreso.set(`${i + 1} de ${archivos.length}`);
        const { s3Key } = await this.servicio.subir(this.informeId(), archivo);
        nuevas.push({ id: crypto.randomUUID(), s3Key, caption: '' });
      }
    } catch (e: unknown) {
      // Lo ya subido se conserva: hacer repetir treinta fotos porque falló la
      // treinta y uno es exactamente lo que hace abandonar la herramienta.
      this.error.set(`${(e as Error).message} Se conservan las ${nuevas.length} que sí subieron.`);
    } finally {
      this.subiendo.set(false);
      this.progreso.set('');
      if (nuevas.length) {
        this.agregadas.emit(nuevas);
        void this.cargarUrls([...this.fotos(), ...nuevas]);
      }
    }
  }

  /** URLs firmadas para pintar las miniaturas. */
  async cargarUrls(fotos: readonly FotoInforme[]): Promise<void> {
    const claves = fotos.map((f) => f.s3Key).filter(Boolean);
    if (!claves.length) return;
    try {
      this.urls.set(await this.servicio.urlsDeLectura(claves));
    } catch {
      // Sin miniaturas se sigue trabajando: se ve el marcador y el pie.
      this.urls.set({});
    }
  }
}

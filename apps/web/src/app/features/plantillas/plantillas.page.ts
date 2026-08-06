import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { BLOCK_TYPES, type TemplateSectionDefinition } from '@dps/shared';
import { TemplatesService, type VersionDePlantilla } from '../../core/api/reports.service';
import { AuthService } from '../../core/auth/auth.service';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { FieldComponent } from '../../shared/ui/field/field.component';

/** El único formato en uso hoy. Cuando haya más, sale de `reportTemplates`. */
const CODIGO = 'SER-FOR-002';

/** Sección recién añadida: lo mínimo para que sea válida al publicar. */
function seccionNueva(orden: number): TemplateSectionDefinition {
  return {
    clave: `seccion-${orden}`,
    numeral: String(orden),
    titulo: 'Sección nueva',
    orden,
    paso: 3,
    bloques: [],
  };
}

/**
 * Gobierno del formato (E3.7).
 *
 * Es la pantalla que hace cierta la promesa del motor de plantillas: **Calidad
 * publica una versión nueva del SER-FOR-002 sin que nadie toque código.**
 *
 * Dos reglas gobiernan lo que se puede hacer aquí:
 *
 * · **Una versión publicada no se edita.** Puede estar referenciada por informes
 *   emitidos, y cambiarla alteraría documentos ya firmados (§11.1). Para
 *   corregir algo se crea una versión nueva; los informes emitidos siguen
 *   renderizándose con su copia congelada (RN-08).
 *
 * · **La versión nueva nace copiando la vigente.** Empezar de cero obligaría a
 *   volver a escribir doce secciones para añadir una, que es exactamente el
 *   trabajo que esta pantalla existe para evitar.
 */
@Component({
  selector: 'dps-plantillas',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, FieldComponent],
  template: `
    <div class="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-6">
      <header class="flex flex-col gap-1">
        <h1 class="text-headline-md">Formato {{ codigo }}</h1>
        <p class="max-w-[68ch] text-body-sm text-secondary">
          Una versión publicada no se modifica: puede estar referenciada por informes emitidos. Para
          cambiar el formato se publica una versión nueva, y los informes ya emitidos siguen
          saliendo como salieron.
        </p>
      </header>

      @if (error(); as mensaje) {
        <p
          class="whitespace-pre-line rounded border border-error bg-error-container p-3 text-body-sm"
          role="alert"
        >
          {{ mensaje }}
        </p>
      }

      @if (cargando()) {
        <p class="text-body-md text-secondary" role="status">Cargando versiones…</p>
      } @else {
        <section class="flex flex-col gap-3" aria-labelledby="dps-versiones">
          <h2 id="dps-versiones" class="text-title-md">Versiones</h2>

          <ul class="flex flex-col gap-2" role="list">
            @for (v of versiones(); track v.version) {
              <li
                class="flex flex-wrap items-center justify-between gap-3 rounded border p-3"
                [class.border-subtle]="v.version !== elegida()"
                [class.border-primary-container]="v.version === elegida()"
              >
                <div class="flex flex-col">
                  <span class="font-mono text-label-md">{{ v.version }}</span>
                  <span class="text-body-sm text-secondary">
                    {{ v.secciones.length }} secciones ·
                    {{ v.estado === 'publicada' ? 'Publicada' : 'Borrador' }}
                    @if (v.fechaPublicacion) {
                      · {{ fecha(v.fechaPublicacion) }}
                    }
                  </span>
                </div>

                <button
                  type="button"
                  class="dps-btn dps-btn--secondary"
                  [attr.aria-pressed]="v.version === elegida()"
                  (click)="elegir(v.version)"
                >
                  {{ v.estado === 'publicada' ? 'Ver' : 'Editar' }}
                </button>
              </li>
            } @empty {
              <li class="text-body-sm text-secondary">No hay ninguna versión todavía.</li>
            }
          </ul>

          @if (puedeEscribir()) {
            <form class="flex flex-wrap items-end gap-3" (submit)="crear($event)">
              <dps-field
                label="Nueva versión"
                [hint]="'Nace copiando las secciones de la vigente.'"
                #fVersion
              >
                <input
                  class="dps-input font-mono"
                  [id]="fVersion.fieldId"
                  [value]="nuevaVersion()"
                  (input)="nuevaVersion.set(valor($event))"
                  placeholder="v02"
                />
              </dps-field>

              <button
                type="submit"
                class="dps-btn dps-btn--secondary"
                [disabled]="!nuevaVersion().trim() || trabajando()"
              >
                <dps-icon name="add" [size]="18" aria-hidden="true" />
                Crear borrador
              </button>
            </form>
          }
        </section>

        @if (version(); as v) {
          <section class="flex flex-col gap-4" aria-labelledby="dps-secciones">
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="dps-secciones" class="text-title-md">Secciones de {{ v.version }}</h2>
              <span class="font-mono text-label-sm text-secondary" role="status" aria-live="polite">
                @if (sucio()) {
                  Sin guardar
                } @else {
                  Guardado
                }
              </span>
            </div>

            @if (soloLectura()) {
              <p class="flex items-start gap-2 rounded border border-subtle p-3 text-body-sm">
                <dps-icon name="lock" [size]="18" class="mt-0.5 shrink-0" aria-hidden="true" />
                <span>
                  Esta versión está publicada y no se puede modificar. Crea una versión nueva para
                  cambiar el formato.
                </span>
              </p>
            }

            <ol class="flex flex-col gap-3" role="list">
              @for (seccion of secciones(); track seccion.clave; let i = $index) {
                <li class="dps-card flex flex-col gap-3 p-4">
                  <div class="flex flex-wrap items-end gap-3">
                    <dps-field label="Numeral" [required]="false" #fNum>
                      <input
                        class="dps-input w-20 font-mono"
                        [id]="fNum.fieldId"
                        [disabled]="soloLectura()"
                        [value]="seccion.numeral"
                        (change)="editar(i, 'numeral', valor($event))"
                      />
                    </dps-field>

                    <dps-field label="Título de la sección" #fTit>
                      <input
                        class="dps-input min-w-56"
                        [id]="fTit.fieldId"
                        [disabled]="soloLectura()"
                        [value]="seccion.titulo"
                        (change)="editar(i, 'titulo', valor($event))"
                      />
                    </dps-field>

                    <dps-field label="Paso" [required]="false" #fPaso>
                      <input
                        class="dps-input w-20 font-mono"
                        type="number"
                        min="1"
                        max="6"
                        [id]="fPaso.fieldId"
                        [disabled]="soloLectura()"
                        [value]="seccion.paso"
                        (change)="editar(i, 'paso', Number(valor($event)))"
                      />
                    </dps-field>
                  </div>

                  <dps-field
                    label="Se muestra si"
                    [required]="false"
                    [hint]="'Regla de §11.3. Vacío = siempre visible. Ej: motor.tieneCac == true'"
                    #fRegla
                  >
                    <input
                      class="dps-input font-mono"
                      [id]="fRegla.fieldId"
                      [disabled]="soloLectura()"
                      [value]="seccion.visibleSi ?? ''"
                      (change)="editar(i, 'visibleSi', valor($event))"
                    />
                  </dps-field>

                  <p class="font-mono text-label-sm text-secondary">
                    {{ seccion.bloques.length }} bloque(s):
                    {{ resumenDeBloques(seccion) }}
                  </p>

                  @if (!soloLectura()) {
                    <div class="flex flex-wrap gap-2">
                      <button
                        type="button"
                        class="dps-btn dps-btn--tertiary"
                        [disabled]="i === 0"
                        (click)="mover(i, -1)"
                      >
                        <dps-icon name="arrow_upward" [size]="16" aria-hidden="true" />
                        Subir
                      </button>
                      <button
                        type="button"
                        class="dps-btn dps-btn--tertiary"
                        [disabled]="i === secciones().length - 1"
                        (click)="mover(i, 1)"
                      >
                        <dps-icon name="arrow_downward" [size]="16" aria-hidden="true" />
                        Bajar
                      </button>
                      <button
                        type="button"
                        class="dps-btn dps-btn--tertiary"
                        (click)="agregarBloque(i)"
                      >
                        <dps-icon name="add" [size]="16" aria-hidden="true" />
                        Añadir bloque
                      </button>
                      <button
                        type="button"
                        class="dps-btn dps-btn--tertiary text-error"
                        (click)="quitar(i)"
                      >
                        <dps-icon name="delete" [size]="16" aria-hidden="true" />
                        Quitar «{{ seccion.titulo }}»
                      </button>
                    </div>
                  }
                </li>
              } @empty {
                <li class="text-body-sm text-secondary">
                  Esta versión no tiene ninguna sección todavía.
                </li>
              }
            </ol>

            @if (!soloLectura()) {
              <div class="flex flex-wrap gap-3">
                <button type="button" class="dps-btn dps-btn--secondary" (click)="agregarSeccion()">
                  <dps-icon name="add" [size]="18" aria-hidden="true" />
                  Añadir sección
                </button>

                <button
                  type="button"
                  class="dps-btn dps-btn--secondary"
                  [disabled]="!sucio() || trabajando()"
                  (click)="guardar()"
                >
                  Guardar borrador
                </button>

                @if (puedePublicar()) {
                  <button
                    type="button"
                    class="dps-btn dps-btn--primary"
                    [disabled]="trabajando()"
                    (click)="publicar()"
                  >
                    Publicar {{ v.version }}
                  </button>
                }
              </div>
            }
          </section>
        }
      }
    </div>
  `,
})
export class PlantillasPage {
  private readonly api = inject(TemplatesService);
  private readonly auth = inject(AuthService);

  protected readonly codigo = CODIGO;
  protected readonly Number = Number;
  protected readonly tiposDeBloque = BLOCK_TYPES;

  protected readonly versiones = signal<VersionDePlantilla[]>([]);
  protected readonly elegida = signal<string>('');
  protected readonly secciones = signal<TemplateSectionDefinition[]>([]);
  protected readonly nuevaVersion = signal('');
  protected readonly cargando = signal(true);
  protected readonly trabajando = signal(false);
  protected readonly sucio = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly version = computed(() =>
    this.versiones().find((v) => v.version === this.elegida()),
  );

  /** Una versión publicada se ve pero no se toca (§11.1). */
  protected readonly soloLectura = computed(
    () => !this.puedeEscribir() || this.version()?.estado === 'publicada',
  );

  constructor() {
    void this.cargar();
  }

  protected puedeEscribir(): boolean {
    return this.auth.can('templates:write');
  }

  protected puedePublicar(): boolean {
    return this.auth.can('templates:publish') && this.version()?.estado === 'borrador';
  }

  protected valor(evento: Event): string {
    return (evento.target as HTMLInputElement).value;
  }

  protected fecha(iso: string): string {
    const fecha = new Date(iso);
    return isNaN(fecha.getTime()) ? '—' : fecha.toLocaleDateString('es-PE');
  }

  protected resumenDeBloques(seccion: TemplateSectionDefinition): string {
    if (!seccion.bloques.length) return 'ninguno';
    return seccion.bloques.map((b) => `${b.clave} (${b.tipo})`).join(' · ');
  }

  protected elegir(version: string): void {
    this.elegida.set(version);
    const elegida = this.versiones().find((v) => v.version === version);
    // Copia profunda: lo que se edita es un borrador local hasta que se guarda,
    // y mutar el objeto de la lista haría que «descartar» no descartara nada.
    this.secciones.set(structuredClone(elegida?.secciones ?? []));
    this.sucio.set(false);
  }

  protected editar(indice: number, campo: keyof TemplateSectionDefinition, valor: unknown): void {
    this.secciones.update((actuales) =>
      actuales.map((s, i) => (i === indice ? { ...s, [campo]: valor } : s)),
    );
    this.sucio.set(true);
  }

  /**
   * Mueve una sección y **renumera el orden**.
   *
   * El orden es lo que decide la posición en el documento; sin renumerar, la
   * lista se vería movida en pantalla y el PDF saldría igual que antes.
   */
  protected mover(indice: number, delta: number): void {
    const destino = indice + delta;
    const actuales = [...this.secciones()];
    if (destino < 0 || destino >= actuales.length) return;

    const [movida] = actuales.splice(indice, 1);
    actuales.splice(destino, 0, movida as TemplateSectionDefinition);

    this.secciones.set(actuales.map((s, i) => ({ ...s, orden: i + 1 })));
    this.sucio.set(true);
  }

  protected agregarSeccion(): void {
    this.secciones.update((actuales) => [...actuales, seccionNueva(actuales.length + 1)]);
    this.sucio.set(true);
  }

  protected quitar(indice: number): void {
    this.secciones.update((actuales) =>
      actuales.filter((_, i) => i !== indice).map((s, i) => ({ ...s, orden: i + 1 })),
    );
    this.sucio.set(true);
  }

  /**
   * Añade un bloque de texto a la sección.
   *
   * `rich_text` como punto de partida porque es el único tipo que no necesita
   * configuración para ser válido; los demás se ajustan después.
   */
  protected agregarBloque(indice: number): void {
    this.secciones.update((actuales) =>
      actuales.map((s, i) =>
        i === indice
          ? {
              ...s,
              bloques: [
                ...s.bloques,
                {
                  clave: `${s.clave}-bloque-${s.bloques.length + 1}`,
                  tipo: 'rich_text' as const,
                  titulo: 'Bloque nuevo',
                  orden: s.bloques.length + 1,
                },
              ],
            }
          : s,
      ),
    );
    this.sucio.set(true);
  }

  protected async crear(evento: Event): Promise<void> {
    evento.preventDefault();
    const version = this.nuevaVersion().trim();
    if (!version) return;

    this.trabajando.set(true);
    this.error.set(null);

    try {
      // Copia las secciones de la publicada más reciente: añadir una sección no
      // puede costar reescribir las doce que ya existen.
      const base = this.versiones().find((v) => v.estado === 'publicada');
      await this.api.crearVersion(CODIGO, {
        version,
        secciones: structuredClone(base?.secciones ?? []),
      });

      this.nuevaVersion.set('');
      await this.cargar(version);
    } catch (e: unknown) {
      this.error.set(this.mensaje(e, 'No se pudo crear la versión.'));
    } finally {
      this.trabajando.set(false);
    }
  }

  protected async guardar(): Promise<void> {
    const version = this.elegida();
    if (!version) return;

    this.trabajando.set(true);
    this.error.set(null);

    try {
      await this.api.editarVersion(CODIGO, version, this.secciones());
      this.sucio.set(false);
      await this.cargar(version);
    } catch (e: unknown) {
      this.error.set(this.mensaje(e, 'No se pudo guardar el borrador.'));
    } finally {
      this.trabajando.set(false);
    }
  }

  protected async publicar(): Promise<void> {
    const version = this.elegida();
    if (!version) return;

    this.trabajando.set(true);
    this.error.set(null);

    try {
      // Se guarda antes: publicar lo que hay en el servidor y no lo que está en
      // pantalla dejaría fuera lo último que escribió Calidad.
      if (this.sucio()) await this.api.editarVersion(CODIGO, version, this.secciones());
      await this.api.publicar(CODIGO, version);
      this.sucio.set(false);
      await this.cargar(version);
    } catch (e: unknown) {
      // El servidor devuelve la lista de incoherencias en varias líneas; se
      // muestran tal cual, que es más útil que «no se pudo publicar».
      this.error.set(this.mensaje(e, 'No se pudo publicar la versión.'));
    } finally {
      this.trabajando.set(false);
    }
  }

  private async cargar(seleccionar?: string): Promise<void> {
    this.cargando.set(true);

    try {
      const { items } = await this.api.versiones(CODIGO);
      this.versiones.set(items);

      // `||` y no `??`: `elegida()` arranca en cadena vacía, que no es nullish,
      // así que con `??` la primera carga no seleccionaba ninguna versión.
      const destino =
        seleccionar ||
        this.elegida() ||
        items.find((v) => v.estado === 'borrador')?.version ||
        items[0]?.version;

      if (destino) this.elegir(destino);
    } catch (e: unknown) {
      this.error.set(this.mensaje(e, 'No se pudieron cargar las versiones del formato.'));
    } finally {
      this.cargando.set(false);
    }
  }

  private mensaje(error: unknown, porDefecto: string): string {
    const detalle = (error as { error?: { detail?: string } }).error?.detail;
    return detalle ?? porDefecto;
  }
}

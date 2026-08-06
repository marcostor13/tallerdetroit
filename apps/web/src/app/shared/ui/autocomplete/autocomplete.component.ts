import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { MastersService, type MasterItem } from '../../../core/api/masters.service';
import { IconComponent } from '../icon/icon.component';

let nextId = 0;

/**
 * Autocompletado sobre un maestro, con alta rápida sin salir del formulario.
 *
 * Existe por dos requisitos que deciden si el catálogo se usa o se abandona:
 *
 * · §13.3.2 — la búsqueda perdona erratas. La ordena el servidor; aquí no se
 *   vuelve a filtrar, porque reordenar con otro criterio daría una lista
 *   distinta de la que el propio servidor considera la mejor.
 *
 * · §13.3.1 — si el técnico no encuentra la sede, la crea desde aquí mismo. El
 *   borrador no se pierde ni se navega a ninguna parte: el alta ocurre en el
 *   propio desplegable y el valor queda seleccionado.
 *
 * Sigue el patrón ARIA de combobox con listbox, y se maneja entero con teclado
 * (T2): flechas, Inicio/Fin, Enter, Escape. Sin librerías.
 */
@Component({
  selector: 'dps-autocomplete',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  host: { class: 'block relative' },
  template: `
    <div class="relative">
      <input
        #entrada
        type="text"
        role="combobox"
        class="dps-input w-full pr-10"
        autocomplete="off"
        [id]="inputId()"
        [attr.aria-expanded]="abierto()"
        [attr.aria-controls]="listaId"
        [attr.aria-activedescendant]="activoId()"
        [attr.aria-busy]="cargando() || null"
        [attr.aria-invalid]="invalid() || null"
        [attr.placeholder]="placeholder()"
        [disabled]="disabled()"
        [value]="texto()"
        (input)="alEscribir($event)"
        (keydown)="alTeclear($event)"
        (focus)="abrir()"
        (blur)="alPerderFoco()"
      />

      <span
        class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-secondary"
        aria-hidden="true"
      >
        @if (cargando()) {
          <dps-icon name="progress_activity" [size]="18" class="animate-spin" />
        } @else if (seleccionado()) {
          <dps-icon name="check" [size]="18" class="text-success" />
        } @else {
          <dps-icon name="search" [size]="18" />
        }
      </span>
    </div>

    <!-- Estado para lectores de pantalla: sin esto, quien no ve la lista no se
         entera de que han aparecido resultados. -->
    <p class="sr-only" role="status" aria-live="polite">
      @if (abierto() && !cargando()) {
        {{ opciones().length }} resultados para «{{ texto() }}»
      }
    </p>

    @if (abierto()) {
      <ul
        [id]="listaId"
        role="listbox"
        [attr.aria-label]="'Resultados de ' + etiqueta()"
        class="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-subtle bg-surface shadow-lg"
      >
        @for (opcion of opciones(); track opcion._id; let i = $index) {
          <li
            role="option"
            [id]="opcionId(i)"
            [attr.aria-selected]="i === indiceActivo()"
            class="cursor-pointer px-3 py-2.5 text-body-md"
            [class.bg-surface-variant]="i === indiceActivo()"
            (mousedown)="$event.preventDefault(); elegir(opcion)"
            (mousemove)="indiceActivo.set(i)"
          >
            <span class="block truncate">{{ mostrar(opcion) }}</span>
            @if (opcion.pendienteValidacion) {
              <span class="text-label-sm text-secondary">Pendiente de validación</span>
            }
          </li>
        } @empty {
          @if (!cargando()) {
            <li class="px-3 py-2.5 text-body-sm text-secondary" role="presentation">
              No hay coincidencias.
            </li>
          }
        }

        <!-- El alta va dentro de la lista para que se alcance con la misma
             flecha abajo, sin cambiar de contexto ni salir del informe. -->
        @if (puedeCrear()) {
          <li
            role="option"
            [id]="opcionId(opciones().length)"
            [attr.aria-selected]="indiceActivo() === opciones().length"
            class="cursor-pointer border-t border-subtle px-3 py-2.5 text-body-md text-primary"
            [class.bg-surface-variant]="indiceActivo() === opciones().length"
            (mousedown)="$event.preventDefault(); crear()"
            (mousemove)="indiceActivo.set(opciones().length)"
          >
            <dps-icon name="add" [size]="16" class="mr-1.5 align-[-3px]" />
            Crear «{{ texto().trim() }}» como {{ etiqueta() }}
          </li>
        }
      </ul>
    }
  `,
})
export class AutocompleteComponent {
  private readonly maestros = inject(MastersService);
  private readonly entrada = viewChild.required<ElementRef<HTMLInputElement>>('entrada');

  /** Clave del maestro: `clients`, `sites`, `equipment`… */
  readonly coleccion = input.required<string>();
  /** Cómo se nombra en singular, para los textos de la interfaz. */
  readonly etiqueta = input.required<string>();
  /** Campo que se muestra de cada registro. */
  readonly campoTexto = input('nombre');
  /** Filtros de cascada: `{ clienteId: '…' }`. */
  readonly filtros = input<Record<string, string | null | undefined>>({});
  /** Campos con los que se da de alta desde aquí, además del texto escrito. */
  readonly camposAlta = input<Record<string, unknown>>({});
  readonly placeholder = input('Escribe para buscar…');
  readonly disabled = input(false);
  readonly invalid = input(false);
  readonly permiteCrear = input(true);
  readonly inputId = input(`dps-ac${nextId++}`);

  /** Identificador seleccionado. */
  readonly valor = model<string | null>(null);
  /** Nombre del seleccionado, para pintarlo sin volver a consultar. */
  readonly nombre = model<string | null>(null);

  readonly seleccion = output<MasterItem>();
  readonly creado = output<MasterItem>();

  protected readonly texto = signal('');
  protected readonly opciones = signal<MasterItem[]>([]);
  protected readonly abierto = signal(false);
  protected readonly cargando = signal(false);
  protected readonly indiceActivo = signal(-1);
  protected readonly seleccionado = computed(() => this.valor() !== null);

  protected readonly listaId = `dps-ac-lista${nextId++}`;

  /** Solo se ofrece crear si hay texto y no coincide exactamente con nada. */
  protected readonly puedeCrear = computed(() => {
    const escrito = this.texto().trim();
    if (!this.permiteCrear() || !escrito || this.cargando()) return false;
    return !this.opciones().some(
      (o) => String(o[this.campoTexto()] ?? '').toLowerCase() === escrito.toLowerCase(),
    );
  });

  protected readonly activoId = computed(() =>
    this.abierto() && this.indiceActivo() >= 0 ? this.opcionId(this.indiceActivo()) : null,
  );

  private temporizador: ReturnType<typeof setTimeout> | null = null;
  /** Descarta respuestas que llegan tarde y pisarían a una búsqueda posterior. */
  private consulta = 0;

  constructor() {
    // El nombre puede llegar después (al cargar un informe existente), así que
    // se refleja en el cuadro cuando llegue, sin pisar lo que se esté tecleando.
    effect(() => {
      const nombre = this.nombre();
      if (nombre && !this.abierto()) this.texto.set(nombre);
    });

    // Al cambiar un filtro de la cascada, lo elegido puede haber dejado de ser
    // válido: si se cambia de cliente, su sede ya no pertenece a este informe.
    effect(() => {
      const filtros = JSON.stringify(this.filtros());
      if (this.filtrosAnteriores !== null && this.filtrosAnteriores !== filtros) {
        this.valor.set(null);
        this.nombre.set(null);
        this.texto.set('');
        this.opciones.set([]);
      }
      this.filtrosAnteriores = filtros;
    });
  }

  private filtrosAnteriores: string | null = null;

  protected mostrar(opcion: MasterItem): string {
    return String(opcion[this.campoTexto()] ?? opcion['nombre'] ?? opcion['denominacion'] ?? '');
  }

  protected opcionId(indice: number): string {
    return `${this.listaId}-op${indice}`;
  }

  protected abrir(): void {
    if (this.disabled()) return;
    this.abierto.set(true);
    void this.buscar(this.texto());
  }

  protected alEscribir(evento: Event): void {
    const valor = (evento.target as HTMLInputElement).value;
    this.texto.set(valor);
    this.abierto.set(true);

    // Al reescribir se pierde la selección: el texto ya no describe lo elegido.
    if (this.valor()) {
      this.valor.set(null);
      this.nombre.set(null);
    }

    // Se espera a que deje de teclear: sin esto sale una petición por pulsación
    // y las respuestas llegan desordenadas.
    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => void this.buscar(valor), 220);
  }

  protected alTeclear(evento: KeyboardEvent): void {
    const ultimo = this.opciones().length - (this.puedeCrear() ? 0 : 1);

    switch (evento.key) {
      case 'ArrowDown':
        evento.preventDefault();
        if (!this.abierto()) this.abrir();
        this.indiceActivo.update((i) => (i >= ultimo ? 0 : i + 1));
        break;

      case 'ArrowUp':
        evento.preventDefault();
        this.indiceActivo.update((i) => (i <= 0 ? ultimo : i - 1));
        break;

      case 'Home':
        if (!this.abierto()) return;
        evento.preventDefault();
        this.indiceActivo.set(0);
        break;

      case 'End':
        if (!this.abierto()) return;
        evento.preventDefault();
        this.indiceActivo.set(ultimo);
        break;

      case 'Enter': {
        if (!this.abierto()) return;
        // Se corta el envío del formulario: en un wizard, un Enter descuidado
        // dispararía el paso siguiente en vez de elegir de la lista.
        evento.preventDefault();
        const indice = this.indiceActivo();
        const opcion = this.opciones()[indice];
        if (opcion) this.elegir(opcion);
        else if (this.puedeCrear() && indice === this.opciones().length) void this.crear();
        break;
      }

      case 'Escape':
        if (!this.abierto()) return;
        evento.preventDefault();
        this.cerrar();
        break;

      case 'Tab':
        this.cerrar();
        break;

      default:
        break;
    }
  }

  protected alPerderFoco(): void {
    // Si se salió sin elegir, el cuadro vuelve a mostrar lo seleccionado: dejar
    // un texto que no corresponde a ningún registro haría creer que hay valor.
    setTimeout(() => {
      this.cerrar();
      if (!this.valor()) this.texto.set(this.nombre() ?? '');
    }, 120);
  }

  protected elegir(opcion: MasterItem): void {
    this.valor.set(opcion._id);
    this.nombre.set(this.mostrar(opcion));
    this.texto.set(this.mostrar(opcion));
    this.cerrar();
    this.seleccion.emit(opcion);
  }

  /** Alta rápida (§13.3.1): sin salir del formulario y sin perder el borrador. */
  protected async crear(): Promise<void> {
    const escrito = this.texto().trim();
    if (!escrito) return;

    this.cargando.set(true);
    try {
      const creado = await this.maestros.createInline(this.coleccion(), {
        [this.campoTexto()]: escrito,
        ...this.filtrosDeAlta(),
        ...this.camposAlta(),
      });
      this.elegir(creado);
      this.creado.emit(creado);
    } finally {
      this.cargando.set(false);
    }
  }

  /** Lo elegido en la cascada forma parte del alta: una sede es de un cliente. */
  private filtrosDeAlta(): Record<string, unknown> {
    return Object.fromEntries(Object.entries(this.filtros()).filter(([, v]) => Boolean(v)));
  }

  private cerrar(): void {
    this.abierto.set(false);
    this.indiceActivo.set(-1);
  }

  private async buscar(termino: string): Promise<void> {
    const mia = ++this.consulta;
    this.cargando.set(true);

    try {
      const { items } = await this.maestros.search(this.coleccion(), {
        q: termino,
        limit: 20,
        filtros: this.filtros(),
      });
      if (mia !== this.consulta) return;

      this.opciones.set(items);
      this.indiceActivo.set(items.length ? 0 : -1);
    } catch {
      if (mia === this.consulta) this.opciones.set([]);
    } finally {
      if (mia === this.consulta) this.cargando.set(false);
    }
  }

  /** Devuelve el foco al cuadro; lo usa el wizard al saltar a un campo faltante. */
  enfocar(): void {
    this.entrada().nativeElement.focus();
  }
}

import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  AuditService,
  type FiltroDeAuditoria,
  type RegistroDeAuditoria,
} from '../../core/api/audit.service';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { FieldComponent } from '../../shared/ui/field/field.component';

/** Cómo se llama cada acción en pantalla. */
const ACCIONES: Record<string, string> = {
  crear: 'Creó',
  'crear-inline': 'Creó (alta rápida)',
  actualizar: 'Actualizó',
  eliminar: 'Eliminó',
  transicion: 'Cambió el estado',
  emitir: 'Emitió',
  anular: 'Anuló',
  comentar: 'Comentó',
  'resolver-comentario': 'Resolvió un comentario',
  'reabrir-comentario': 'Reabrió un comentario',
  'autorizar-calibracion': 'Autorizó emitir con calibración vencida',
};

/**
 * Consulta de auditoría (E3.8).
 *
 * Responde a la pregunta que se le hace a un log de auditoría: **quién tocó
 * qué, cuándo y desde dónde.** Por eso el filtro es por actor, entidad, acción
 * y rango de fechas, y no una búsqueda libre: quien viene aquí ya sabe qué
 * busca, normalmente porque algo no cuadra.
 *
 * Lo más nuevo va primero. Un log ordenado al revés obliga a paginar hasta el
 * final para ver lo que acaba de pasar, que es lo que casi siempre se busca.
 */
@Component({
  selector: 'dps-auditoria',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, FieldComponent],
  template: `
    <div class="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-6">
      <header class="flex flex-col gap-1">
        <h1 class="text-headline-md">Auditoría</h1>
        <p class="max-w-[68ch] text-body-sm text-secondary">
          Registro de las escrituras relevantes. No se puede editar ni borrar; se conserva siete
          años.
        </p>
      </header>

      <form class="flex flex-wrap items-end gap-3" (submit)="buscar($event)">
        <dps-field label="Entidad" [required]="false" #fEntidad>
          <select
            class="dps-input"
            [id]="fEntidad.fieldId"
            [value]="entidad()"
            (change)="entidad.set(valor($event))"
          >
            <option value="">Todas</option>
            <option value="reports">Informes</option>
            <option value="masters.clients">Maestro · clientes</option>
            <option value="masters.engine-models">Maestro · modelos de motor</option>
            <option value="masters.instruments">Maestro · instrumentos</option>
            <option value="templateVersions">Plantillas</option>
            <option value="users">Usuarios</option>
          </select>
        </dps-field>

        <dps-field label="Acción" [required]="false" #fAccion>
          <select
            class="dps-input"
            [id]="fAccion.fieldId"
            [value]="accion()"
            (change)="accion.set(valor($event))"
          >
            <option value="">Todas</option>
            @for (clave of clavesDeAccion; track clave) {
              <option [value]="clave">{{ rotulo(clave) }}</option>
            }
          </select>
        </dps-field>

        <dps-field label="Desde" [required]="false" #fDesde>
          <input
            class="dps-input"
            type="date"
            [id]="fDesde.fieldId"
            [value]="desde()"
            (change)="desde.set(valor($event))"
          />
        </dps-field>

        <dps-field label="Hasta" [required]="false" #fHasta>
          <input
            class="dps-input"
            type="date"
            [id]="fHasta.fieldId"
            [value]="hasta()"
            (change)="hasta.set(valor($event))"
          />
        </dps-field>

        <button type="submit" class="dps-btn dps-btn--primary">
          <dps-icon name="search" [size]="18" aria-hidden="true" />
          Buscar
        </button>

        @if (hayFiltro()) {
          <button type="button" class="dps-btn dps-btn--tertiary" (click)="limpiar()">
            Limpiar
          </button>
        }
      </form>

      <p class="font-mono text-label-sm text-secondary" role="status" aria-live="polite">
        @if (cargando()) {
          Buscando…
        } @else {
          {{ total() }} registro(s)
        }
      </p>

      @if (error(); as mensaje) {
        <p class="rounded border border-error bg-error-container p-3 text-body-sm" role="alert">
          {{ mensaje }}
        </p>
      }

      @if (!cargando() && !registros().length && !error()) {
        <div class="flex flex-col items-start gap-2 rounded-lg border border-subtle p-6">
          <dps-icon name="history" [size]="32" class="text-secondary" aria-hidden="true" />
          <p class="text-body-md">No hay registros con esos filtros.</p>
          <p class="text-body-sm text-secondary">Prueba a ampliar el rango de fechas.</p>
        </div>
      }

      <!--
        A partir de md es una tabla; por debajo, una lista de tarjetas. Seis
        columnas a 360 px obligarían a desplazarse en dos ejes (§7.5 del sistema
        de diseño).
      -->
      @if (registros().length) {
        <ul class="flex flex-col gap-3 md:hidden" role="list">
          @for (registro of registros(); track registro._id) {
            <li class="dps-card flex flex-col gap-1 p-3">
              <span class="font-mono text-label-sm text-secondary">{{
                cuando(registro.fecha)
              }}</span>
              <span class="text-body-md">
                <strong>{{ registro.actorEmail }}</strong> · {{ rotulo(registro.accion) }}
              </span>
              <span class="font-mono text-label-sm">
                {{ registro.etiqueta || registro.entidadId }}
              </span>
              <span class="font-mono text-label-sm text-secondary">{{ registro.entidad }}</span>
            </li>
          }
        </ul>

        <div class="hidden overflow-x-auto md:block">
          <table class="w-full border-collapse">
            <caption class="sr-only">
              Registros de auditoría, del más reciente al más antiguo
            </caption>
            <thead>
              <tr>
                @for (columna of columnas; track columna) {
                  <th
                    scope="col"
                    class="whitespace-nowrap bg-surface-container-low px-3 py-2 text-left font-mono text-label-md uppercase"
                  >
                    {{ columna }}
                  </th>
                }
              </tr>
            </thead>
            <tbody>
              @for (registro of registros(); track registro._id) {
                <tr class="border-t border-subtle">
                  <td class="whitespace-nowrap px-3 py-2 font-mono text-label-sm tabular-nums">
                    {{ cuando(registro.fecha) }}
                  </td>
                  <td class="px-3 py-2 text-body-sm">
                    {{ registro.actorEmail }}
                    @if (registro.actorRol) {
                      <span class="ml-1 font-mono text-label-sm text-secondary">
                        {{ registro.actorRol }}
                      </span>
                    }
                  </td>
                  <td class="px-3 py-2 text-body-sm">{{ rotulo(registro.accion) }}</td>
                  <td class="px-3 py-2 font-mono text-label-sm">{{ registro.entidad }}</td>
                  <td class="px-3 py-2 font-mono text-label-sm">
                    {{ registro.etiqueta || registro.entidadId }}
                  </td>
                  <td class="whitespace-nowrap px-3 py-2 font-mono text-label-sm text-secondary">
                    {{ registro.ip || '—' }}
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        @if (registros().length < total()) {
          <button
            type="button"
            class="dps-btn dps-btn--secondary self-start"
            (click)="masResultados()"
          >
            Cargar más ({{ registros().length }} de {{ total() }})
          </button>
        }
      }
    </div>
  `,
})
export class AuditoriaPage {
  private readonly api = inject(AuditService);

  protected readonly columnas = ['Cuándo', 'Quién', 'Qué hizo', 'Entidad', 'Sobre', 'IP'];
  protected readonly clavesDeAccion = Object.keys(ACCIONES);

  protected readonly entidad = signal('');
  protected readonly accion = signal('');
  protected readonly desde = signal('');
  protected readonly hasta = signal('');

  protected readonly registros = signal<RegistroDeAuditoria[]>([]);
  protected readonly total = signal(0);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);

  constructor() {
    void this.consultar();
  }

  protected rotulo(accion: string): string {
    return ACCIONES[accion] ?? accion;
  }

  protected valor(evento: Event): string {
    return (evento.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected cuando(iso: string): string {
    const fecha = new Date(iso);
    return isNaN(fecha.getTime()) ? '—' : fecha.toLocaleString('es-PE');
  }

  protected hayFiltro(): boolean {
    return !!(this.entidad() || this.accion() || this.desde() || this.hasta());
  }

  protected buscar(evento: Event): void {
    evento.preventDefault();
    void this.consultar();
  }

  protected limpiar(): void {
    this.entidad.set('');
    this.accion.set('');
    this.desde.set('');
    this.hasta.set('');
    void this.consultar();
  }

  protected masResultados(): void {
    void this.consultar(this.registros().length);
  }

  private async consultar(skip = 0): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);

    const filtro: FiltroDeAuditoria = {
      ...(this.entidad() ? { entidad: this.entidad() } : {}),
      ...(this.accion() ? { accion: this.accion() } : {}),
      ...(this.desde() ? { desde: this.desde() } : {}),
      ...(this.hasta() ? { hasta: this.hasta() } : {}),
      limit: 50,
      skip,
    };

    try {
      const { total, items } = await this.api.consultar(filtro);
      this.total.set(total);
      // Con `skip` se acumula; sin él es una búsqueda nueva y se reemplaza.
      this.registros.update((actuales) => (skip ? [...actuales, ...items] : items));
    } catch {
      this.error.set('No se pudo consultar la auditoría. Inténtalo de nuevo.');
      if (!skip) this.registros.set([]);
    } finally {
      this.cargando.set(false);
    }
  }
}

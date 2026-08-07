import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { REPORT_STATUSES } from '@dps/shared';
import { ReportsService, type Informe, type ResumenInforme } from '../../core/api/reports.service';
import { ConnectionService } from '../../core/connection/connection.service';
import { InformesOfflineService } from '../../core/sync/informes-offline.service';
import { AutocompleteComponent } from '../../shared/ui/autocomplete/autocomplete.component';
import { FieldComponent } from '../../shared/ui/field/field.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';

/**
 * Bandeja e historial (E1.8).
 *
 * En escritorio es una tabla y en móvil una lista de tarjetas — no la misma
 * tabla con scroll horizontal. Una tabla de siete columnas a 360 px obliga a
 * desplazarse en dos ejes para leer una sola fila, y el técnico consulta la
 * bandeja de pie junto al motor (T3).
 */
@Component({
  selector: 'dps-bandeja',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, FieldComponent, AutocompleteComponent],
  template: `
    <div class="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-6">
      <header class="flex flex-wrap items-center justify-between gap-3">
        <h1 class="text-title-lg">Informes</h1>
        <button
          type="button"
          class="dps-btn dps-btn--primary"
          [attr.aria-expanded]="formularioNuevo()"
          aria-controls="dps-nuevo-informe"
          (click)="formularioNuevo.set(!formularioNuevo())"
        >
          <dps-icon name="add" [size]="18" aria-hidden="true" />
          Nuevo informe
        </button>
      </header>

      <!--
        El alta ocurre aquí y no en un cuadro de diálogo del navegador: un
        window.prompt no se puede etiquetar, se ve mal en móvil y no tiene dónde
        mostrar el error de número duplicado.
      -->
      @if (formularioNuevo()) {
        <form
          id="dps-nuevo-informe"
          class="dps-card flex flex-col gap-4 p-4 md:flex-row md:items-end"
          (submit)="$event.preventDefault(); crear()"
        >
          <dps-field
            label="N° del informe"
            hint="Por ejemplo ITS-T-E-26-003-0899"
            [error]="errorAlCrear() ?? ''"
            class="flex-1"
            #fn
          >
            <input
              class="dps-input w-full"
              [id]="fn.fieldId"
              [attr.aria-invalid]="errorAlCrear() ? true : null"
              [value]="numeroNuevo()"
              (input)="numeroNuevo.set(desdeEvento($event))"
            />
          </dps-field>

          <button
            type="submit"
            class="dps-btn dps-btn--primary"
            [disabled]="creando() || !numeroNuevo().trim()"
          >
            {{ creando() ? 'Creando…' : 'Crear y editar' }}
          </button>
        </form>
      }

      <form class="grid gap-4 md:grid-cols-3" (submit)="$event.preventDefault(); buscar()">
        <dps-field label="Buscar" [required]="false" hint="N° de informe o de O/T" #fq>
          <input
            class="dps-input"
            type="search"
            [id]="fq.fieldId"
            [value]="q()"
            (input)="q.set(desdeEvento($event))"
            (change)="buscar()"
          />
        </dps-field>

        <dps-field label="Estado" [required]="false" #fe>
          <select
            class="dps-input"
            [id]="fe.fieldId"
            [value]="estado() ?? ''"
            (change)="estado.set(desdeEvento($event) || null); buscar()"
          >
            <option value="">Todos</option>
            @for (e of estados; track e) {
              <option [value]="e">{{ e }}</option>
            }
          </select>
        </dps-field>

        <dps-field label="Cliente" [required]="false" #fc>
          <dps-autocomplete
            coleccion="clients"
            etiqueta="cliente"
            campoTexto="nombreCorto"
            [inputId]="fc.fieldId"
            [permiteCrear]="false"
            (seleccion)="clienteId.set($event._id); buscar()"
          />
        </dps-field>
      </form>

      <!--
        Lo que solo existe en el dispositivo va arriba y con su propio rótulo.
        Mezclarlo con el resto lo haría indistinguible de lo que ya está a salvo
        en el servidor, y son dos cosas muy distintas para el técnico.
      -->
      @if (locales().length) {
        <section
          class="flex flex-col gap-3 rounded border border-subtle bg-warning-container p-4 text-on-warning-container"
          aria-labelledby="dps-sin-sincronizar"
        >
          <h2 id="dps-sin-sincronizar" class="text-title-sm">
            Sin sincronizar ({{ locales().length }})
          </h2>
          <p class="text-body-sm">
            Estos informes solo están en este dispositivo. Se subirán solos en cuanto haya conexión.
          </p>
          <ul class="flex flex-col gap-2" role="list">
            @for (informe of locales(); track informe._id) {
              <li>
                <a
                  [routerLink]="['/informes', informe._id]"
                  class="flex min-h-11 flex-wrap items-center gap-2 underline"
                >
                  <span class="font-mono">{{ informe.numeroInforme }}</span>
                  <span class="text-body-sm">Continuar la captura</span>
                </a>
              </li>
            }
          </ul>
        </section>
      }

      @if (cargando()) {
        <p class="text-body-md text-secondary" role="status">Buscando…</p>
      } @else if (!conexion.online()) {
        <p class="dps-card p-6 text-center text-body-md text-secondary">
          Sin conexión: aquí solo se ve lo que está guardado en este dispositivo.
        </p>
      } @else if (!informes().length) {
        <p class="dps-card p-6 text-center text-body-md text-secondary">
          No hay informes que coincidan.
        </p>
      } @else {
        <!-- Escritorio -->
        <div class="hidden overflow-x-auto md:block">
          <table class="w-full text-body-sm">
            <caption class="sr-only">
              Informes encontrados:
              {{
                informes().length
              }}
            </caption>
            <thead>
              <tr class="border-b border-subtle text-left">
                <th scope="col" class="py-2 pr-4 font-mono text-label-sm uppercase">N° informe</th>
                <th scope="col" class="py-2 pr-4 font-mono text-label-sm uppercase">O/T</th>
                <th scope="col" class="py-2 pr-4 font-mono text-label-sm uppercase">Cliente</th>
                <th scope="col" class="py-2 pr-4 font-mono text-label-sm uppercase">Estado</th>
                <th scope="col" class="py-2 font-mono text-label-sm uppercase">Actualizado</th>
              </tr>
            </thead>
            <tbody>
              @for (informe of informes(); track informe._id) {
                <tr class="border-b border-subtle">
                  <td class="py-3 pr-4">
                    <a [routerLink]="['/informes', informe._id]" class="dps-btn-text font-mono">
                      {{ informe.numeroInforme }}
                    </a>
                  </td>
                  <td class="py-3 pr-4 font-mono">{{ informe.numeroOt || '—' }}</td>
                  <td class="py-3 pr-4">{{ informe.cliente?.nombre || '—' }}</td>
                  <td class="py-3 pr-4">
                    <span class="dps-chip">{{ informe.estado }}</span>
                  </td>
                  <td class="py-3">{{ fecha(informe.updatedAt) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <!-- Móvil -->
        <ul class="flex flex-col gap-3 md:hidden" role="list">
          @for (informe of informes(); track informe._id) {
            <li class="dps-card p-4">
              <a [routerLink]="['/informes', informe._id]" class="flex flex-col gap-1">
                <span class="font-mono text-title-sm">{{ informe.numeroInforme }}</span>
                <span class="text-body-sm text-secondary">
                  {{ informe.cliente?.nombre || 'Sin cliente' }}
                </span>
                <span class="mt-1 flex items-center gap-2">
                  <span class="dps-chip">{{ informe.estado }}</span>
                  <span class="text-body-sm text-secondary">{{ fecha(informe.updatedAt) }}</span>
                </span>
              </a>
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class BandejaPage {
  private readonly api = inject(ReportsService);
  private readonly router = inject(Router);
  private readonly offline = inject(InformesOfflineService);
  protected readonly conexion = inject(ConnectionService);

  protected readonly estados = REPORT_STATUSES;

  protected readonly q = signal('');
  protected readonly estado = signal<string | null>(null);
  protected readonly clienteId = signal<string | null>(null);
  protected readonly informes = signal<ResumenInforme[]>([]);
  /** Los que solo existen en este dispositivo. Se listan aparte y arriba. */
  protected readonly locales = signal<ResumenInforme[]>([]);
  protected readonly cargando = signal(true);

  protected readonly formularioNuevo = signal(false);
  protected readonly numeroNuevo = signal('');
  protected readonly creando = signal(false);
  protected readonly errorAlCrear = signal<string | null>(null);

  constructor() {
    void this.buscar();
  }

  protected desdeEvento(evento: Event): string {
    return (evento.target as HTMLInputElement | HTMLSelectElement).value;
  }

  /**
   * Trae la bandeja.
   *
   * Lo que está sin sincronizar va **primero y siempre**, sin pasar por los
   * filtros: es lo único que existe en un solo sitio, y esconderlo tras un
   * filtro de cliente —que un informe recién creado todavía no tiene— haría que
   * el técnico creyera que su trabajo se perdió.
   */
  protected async buscar(): Promise<void> {
    this.cargando.set(true);
    try {
      const locales = await this.offline.informesLocales();
      this.locales.set(locales.map((i) => this.aResumen(i)));

      if (!this.conexion.online()) {
        this.informes.set([]);
        return;
      }

      const { items } = await this.api.list({
        q: this.q(),
        estado: this.estado(),
        clienteId: this.clienteId(),
      });
      this.informes.set(items);
    } catch {
      // Sin servidor queda lo del dispositivo, que ya está puesto.
      this.informes.set([]);
    } finally {
      this.cargando.set(false);
    }
  }

  private aResumen(informe: Informe): ResumenInforme {
    return {
      _id: informe._id,
      numeroInforme: informe.numeroInforme,
      numeroOt: informe.numeroOt ?? null,
      estado: informe.estado,
      cliente: informe.cliente,
      updatedAt: informe.updatedAt,
    };
  }

  protected fecha(iso?: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('es-PE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  /**
   * Crea el borrador y entra a editarlo.
   *
   * El número se pide antes de crear porque es único y lo escribe el usuario
   * mientras D3 siga sin fijar la convención: crear sin número dejaría
   * borradores que luego chocan entre sí al rellenarlo.
   */
  protected async crear(): Promise<void> {
    const numero = this.numeroNuevo().trim();
    if (!numero) return;

    this.creando.set(true);
    this.errorAlCrear.set(null);
    try {
      // Sin red —o si la petición muere en el intento— el informe nace en el
      // dispositivo con un id local y sube cuando vuelva la señal (E4.3).
      const informe = await this.offline.crear(numero, () =>
        this.api.create({ numeroInforme: numero }),
      );
      await this.router.navigate(['/informes', informe._id]);
    } catch (e: unknown) {
      this.errorAlCrear.set(this.mensaje(e));
    } finally {
      this.creando.set(false);
    }
  }

  /**
   * Qué decirle al usuario.
   *
   * El `detail` del servidor es lo primero: es el que sabe que ese número ya
   * existe. Si el error nació aquí —no hay plantilla guardada para crear sin
   * red— su mensaje ya está escrito para leerse.
   */
  private mensaje(error: unknown): string {
    const detalle = (error as { error?: { detail?: string } }).error?.detail;
    if (detalle) return detalle;
    if (error instanceof HttpErrorResponse) return 'No se pudo crear el informe.';
    return (error as Error).message || 'No se pudo crear el informe.';
  }
}

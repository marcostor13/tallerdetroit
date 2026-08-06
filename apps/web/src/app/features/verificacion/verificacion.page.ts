import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { LogoComponent } from '../../shared/ui/logo/logo.component';

interface Verificacion {
  readonly numeroInforme: string;
  readonly numeroOt: string | null;
  readonly estado: string;
  readonly vigente: boolean;
  readonly fechaEmision: string | null;
  readonly cliente: string | null;
  readonly equipo: string | null;
  readonly motor: string | null;
  readonly hash: string | null;
}

/**
 * Verificación pública de un informe (E3.6).
 *
 * Es el destino del QR del pie del documento. Quien llega aquí tiene el papel
 * delante y una sola pregunta: **¿esto es auténtico y sigue valiendo?**
 *
 * Por eso la pantalla responde eso y nada más. No pide credenciales —un QR que
 * exige iniciar sesión no lo escanea nadie— y no muestra el contenido técnico:
 * cualquiera puede llegar, incluido quien no debería leer las mediciones del
 * motor de un cliente.
 *
 * Un informe **anulado** se verifica igual y lo dice en grande. Es justamente
 * el caso que hace útil la verificación: alguien tiene en la mano un documento
 * que la empresa ya retiró.
 */
@Component({
  selector: 'dps-verificacion',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, LogoComponent],
  template: `
    <div class="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-6 px-5 py-10">
      <dps-logo class="h-10 self-start" />

      <h1 class="text-headline-md">Verificación de informe</h1>

      @if (cargando()) {
        <p class="text-body-md text-secondary" role="status">Comprobando…</p>
      } @else if (informe(); as datos) {
        <div
          class="flex items-start gap-3 rounded-lg border p-4"
          [class.border-subtle]="datos.vigente"
          [class.bg-success-container]="datos.vigente"
          [class.border-error]="!datos.vigente"
          [class.bg-error-container]="!datos.vigente"
        >
          <dps-icon
            [name]="datos.vigente ? 'verified' : 'block'"
            [size]="24"
            class="mt-0.5 shrink-0"
            aria-hidden="true"
          />
          <div>
            <p class="text-title-sm">
              {{ datos.vigente ? 'Documento auténtico y vigente' : 'Este documento ya no vale' }}
            </p>
            <p class="text-body-sm">
              @if (datos.vigente) {
                Emitido por Detroit Power System Perú.
              } @else {
                Consta en la plataforma como <strong>{{ datos.estado }}</strong
                >. Pide una copia vigente antes de usarlo.
              }
            </p>
          </div>
        </div>

        <!--
          Lista de especificaciones con líder punteado: es el patrón del sistema
          de diseño para pares atributo/valor, y evoca el manual de ingeniería.
        -->
        <dl class="flex flex-col">
          <div class="spec-row">
            <dt class="text-body-sm text-secondary">N° de informe</dt>
            <dd class="font-mono tabular-nums">{{ datos.numeroInforme }}</dd>
          </div>
          @if (datos.numeroOt) {
            <div class="spec-row">
              <dt class="text-body-sm text-secondary">N° de O/T</dt>
              <dd class="font-mono tabular-nums">{{ datos.numeroOt }}</dd>
            </div>
          }
          @if (datos.fechaEmision) {
            <div class="spec-row">
              <dt class="text-body-sm text-secondary">Fecha de emisión</dt>
              <dd class="font-mono tabular-nums">{{ fecha(datos.fechaEmision) }}</dd>
            </div>
          }
          @if (datos.cliente) {
            <div class="spec-row">
              <dt class="text-body-sm text-secondary">Cliente</dt>
              <dd>{{ datos.cliente }}</dd>
            </div>
          }
          @if (datos.equipo) {
            <div class="spec-row">
              <dt class="text-body-sm text-secondary">Equipo</dt>
              <dd class="font-mono tabular-nums">{{ datos.equipo }}</dd>
            </div>
          }
          @if (datos.motor) {
            <div class="spec-row">
              <dt class="text-body-sm text-secondary">N° de serie del motor</dt>
              <dd class="font-mono tabular-nums">{{ datos.motor }}</dd>
            </div>
          }
          @if (datos.hash) {
            <div class="spec-row">
              <dt class="text-body-sm text-secondary">SHA-256 del archivo</dt>
              <dd class="break-all font-mono text-label-sm">{{ datos.hash }}</dd>
            </div>
          }
        </dl>

        <p class="max-w-[68ch] text-body-sm text-secondary">
          Esta página confirma que el informe existe en la plataforma y en qué estado está. No
          muestra su contenido técnico.
        </p>
      } @else {
        <div class="flex items-start gap-3 rounded-lg border border-error bg-error-container p-4">
          <dps-icon name="error" [size]="24" class="mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <p class="text-title-sm">No encontramos ningún informe con ese número</p>
            <p class="text-body-sm">
              Comprueba que lo has copiado completo. Si el documento que tienes lleva este número,
              avisa a Detroit Power System: puede no haber salido de la plataforma.
            </p>
          </div>
        </div>
      }
    </div>
  `,
})
export class VerificacionPage {
  private readonly http = inject(HttpClient);
  private readonly ruta = inject(ActivatedRoute);

  protected readonly cargando = signal(true);
  protected readonly informe = signal<Verificacion | null>(null);

  constructor() {
    const numero = this.ruta.snapshot.paramMap.get('numero');
    void this.comprobar(numero);
  }

  protected fecha(iso: string): string {
    const fecha = new Date(iso);
    return isNaN(fecha.getTime()) ? '—' : fecha.toLocaleDateString('es-PE');
  }

  private async comprobar(numero: string | null): Promise<void> {
    if (!numero) {
      this.cargando.set(false);
      return;
    }

    try {
      this.informe.set(
        await firstValueFrom(
          this.http.get<Verificacion>(
            `${environment.apiUrl}/verificacion/${encodeURIComponent(numero)}`,
          ),
        ),
      );
    } catch {
      // Un 404 aquí no es un error de la aplicación: es la respuesta. Lo que
      // no puede pasar es que la pantalla se quede en blanco.
      this.informe.set(null);
    } finally {
      this.cargando.set(false);
    }
  }
}

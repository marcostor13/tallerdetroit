import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ConnectionChipComponent } from '../../shared/ui/connection-chip/connection-chip.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';

interface QuickAction {
  readonly path: string;
  readonly icon: string;
  readonly title: string;
  readonly description: string;
}

@Component({
  selector: 'dps-home-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, ConnectionChipComponent],
  template: `
    <div class="flex flex-col gap-8">
      <header class="flex flex-col gap-3">
        <p class="font-mono text-label-sm uppercase text-secondary">
          {{ saludo() }}
        </p>
        <h1 class="font-headline text-headline-lg-mobile text-on-surface md:text-headline-lg">
          {{ user()?.nombre ?? 'Bienvenido' }}
        </h1>
        <div class="md:hidden">
          <dps-connection-chip />
        </div>
      </header>

      <section aria-labelledby="acciones-titulo" class="flex flex-col gap-4">
        <div class="flex items-end justify-between border-b border-subtle pb-3">
          <h2
            id="acciones-titulo"
            class="font-mono text-label-md uppercase tracking-widest text-secondary"
          >
            Acciones rápidas
          </h2>
        </div>

        <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          @for (action of actions(); track action.path) {
            <li>
              <a
                [routerLink]="action.path"
                class="group flex h-full min-h-[152px] flex-col justify-between gap-6 rounded border border-subtle bg-surface-container-lowest p-6 transition-colors hover:bg-surface-container-low"
              >
                <dps-icon [name]="action.icon" [size]="32" class="text-primary" />
                <div>
                  <h3
                    class="font-headline text-title-sm text-on-surface transition-colors group-hover:text-primary"
                  >
                    {{ action.title }}
                  </h3>
                  <p class="mt-1 text-body-sm text-secondary">{{ action.description }}</p>
                </div>
              </a>
            </li>
          }
        </ul>
      </section>

      <section aria-labelledby="estado-titulo" class="flex flex-col gap-4">
        <div class="flex items-end justify-between border-b border-subtle pb-3">
          <h2
            id="estado-titulo"
            class="font-mono text-label-md uppercase tracking-widest text-secondary"
          >
            Estado de la plataforma
          </h2>
          <span class="font-mono text-label-sm text-gray-medium">FASE F0</span>
        </div>

        <div class="dps-card p-6">
          <div class="dps-spec-row">
            <span class="text-body-md text-secondary">Entorno</span>
            <span class="text-on-surface">{{ entorno }}</span>
          </div>
          <div class="dps-spec-row">
            <span class="text-body-md text-secondary">Rol</span>
            <span class="text-on-surface">{{ user()?.rol ?? '—' }}</span>
          </div>
          <div class="dps-spec-row">
            <span class="text-body-md text-secondary">Permisos activos</span>
            <span class="text-on-surface">{{ user()?.permisos?.length ?? 0 }}</span>
          </div>
        </div>

        <p class="max-w-measure text-body-sm text-secondary">
          Las funcionalidades de negocio se habilitan por fases según
          <code class="font-mono text-label-sm">PLAN.md</code>. F1 entrega el núcleo de informes.
        </p>
      </section>
    </div>
  `,
})
export class HomePage {
  private readonly auth = inject(AuthService);

  protected readonly user = this.auth.user;
  protected readonly entorno = 'develop';

  protected readonly saludo = computed(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Buenos días';
    if (h < 19) return 'Buenas tardes';
    return 'Buenas noches';
  });

  protected readonly actions = computed<readonly QuickAction[]>(() => {
    const all: readonly (QuickAction & { permiso: string | null })[] = [
      {
        path: '/informes/nuevo',
        icon: 'note_add',
        title: 'Nuevo informe',
        description: 'Crear un informe técnico en borrador',
        permiso: 'reports:create',
      },
      {
        path: '/informes',
        icon: 'description',
        title: 'Mis informes',
        description: 'Bandeja de informes asignados y su estado',
        permiso: 'reports:read',
      },
      {
        path: '/equipos',
        icon: 'precision_manufacturing',
        title: 'Equipos y motores',
        description: 'Ficha 360° por número de serie',
        permiso: 'masters:read',
      },
      {
        path: '/maestros',
        icon: 'inventory_2',
        title: 'Maestros',
        description: 'Catálogos de clientes, motores e instrumentos',
        permiso: 'masters:write',
      },
      {
        path: '/analitica',
        icon: 'insights',
        title: 'Analítica',
        description: 'Indicadores y tendencias de desgaste',
        permiso: 'analytics:read',
      },
    ];

    return all
      .filter((a) => !a.permiso || this.auth.can(a.permiso as never))
      .map(({ permiso: _permiso, ...rest }) => rest);
  });
}

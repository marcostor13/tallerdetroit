import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { ThemeService, type ThemeMode } from '../../core/theme/theme.service';
import { ConnectionChipComponent } from '../../shared/ui/connection-chip/connection-chip.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';

const ETIQUETA_ROL: Record<string, string> = {
  administrador: 'Administrador',
  supervisor: 'Supervisor',
  tecnico: 'Técnico',
  visor: 'Visor',
  calidad: 'Calidad',
  planificacion: 'Planificación',
};

const DESCRIPCION_ROL: Record<string, string> = {
  administrador: 'Gestión de usuarios, configuración, acceso total y auditoría.',
  supervisor: 'Revisa, valida evidencias y aprueba informes de su unidad de negocio.',
  tecnico: 'Crea y edita informes, captura fotografías y mediciones.',
  visor: 'Consulta informes aprobados. Sin permisos de edición.',
  calidad: 'Dueño del formato SER-FOR-002: compone, versiona y publica plantillas.',
  planificacion: 'Crea órdenes de trabajo y asigna técnicos.',
};

@Component({
  selector: 'dps-perfil-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, ConnectionChipComponent],
  templateUrl: './perfil.page.html',
})
export class PerfilPage {
  private readonly auth = inject(AuthService);
  protected readonly theme = inject(ThemeService);

  protected readonly user = this.auth.user;
  protected readonly saliendo = signal(false);
  protected readonly permisosVisibles = signal(false);

  protected readonly iniciales = computed(() => {
    const nombre = this.user()?.nombre ?? '';
    return (
      nombre
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase() ?? '')
        .join('') || '?'
    );
  });

  protected readonly rolEtiqueta = computed(() => {
    const rol = this.user()?.rol;
    return rol ? (ETIQUETA_ROL[rol] ?? rol) : '—';
  });

  protected readonly rolDescripcion = computed(() => {
    const rol = this.user()?.rol;
    return rol ? (DESCRIPCION_ROL[rol] ?? '') : '';
  });

  /** Permisos agrupados por recurso, que es como se leen mejor. */
  protected readonly permisosPorGrupo = computed(() => {
    const permisos = this.user()?.permisos ?? [];
    const grupos = new Map<string, string[]>();
    for (const p of permisos) {
      const [recurso = 'otros', ...resto] = p.split(':');
      if (!grupos.has(recurso)) grupos.set(recurso, []);
      grupos.get(recurso)!.push(resto.join(':'));
    }
    return [...grupos].map(([recurso, acciones]) => ({ recurso, acciones }));
  });

  protected readonly opcionesTema: readonly { valor: ThemeMode; icono: string; texto: string }[] = [
    { valor: 'light', icono: 'light_mode', texto: 'Claro' },
    { valor: 'system', icono: 'brightness_auto', texto: 'Según el sistema' },
    { valor: 'dark', icono: 'dark_mode', texto: 'Oscuro' },
  ];

  protected togglePermisos(): void {
    this.permisosVisibles.update((v) => !v);
  }

  protected async cerrarSesion(): Promise<void> {
    this.saliendo.set(true);
    await this.auth.logout();
  }
}

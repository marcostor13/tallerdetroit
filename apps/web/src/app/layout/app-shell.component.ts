import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';
import { ConnectionChipComponent } from '../shared/ui/connection-chip/connection-chip.component';
import { IconComponent } from '../shared/ui/icon/icon.component';
import { LogoComponent } from '../shared/ui/logo/logo.component';
import { ThemeToggleComponent } from '../shared/ui/theme-toggle/theme-toggle.component';
import { NAV_ITEMS, PROFILE_NAV_ITEM } from './navigation';

/**
 * Marco de la aplicación.
 *
 * Móvil (< 768 px): cabecera fija + barra inferior de 5 destinos. Se comporta
 * como app nativa, según `especificaciones.md`.
 * Escritorio (≥ 1024 px): sidebar de 264 px colapsable + cabecera con buscador.
 */
@Component({
  selector: 'dps-app-shell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    IconComponent,
    LogoComponent,
    ThemeToggleComponent,
    ConnectionChipComponent,
  ],
  templateUrl: './app-shell.component.html',
})
export class AppShellComponent {
  private readonly auth = inject(AuthService);

  protected readonly user = this.auth.user;
  protected readonly sidebarCollapsed = signal(false);
  protected readonly mobileMenuOpen = signal(false);

  /** Solo los destinos para los que el usuario tiene permiso. */
  protected readonly visibleItems = computed(() =>
    NAV_ITEMS.filter((i) => i.permissions.length === 0 || this.auth.canAny(i.permissions)),
  );

  protected readonly bottomNavItems = computed(() => [
    ...this.visibleItems()
      .filter((i) => i.inBottomNav)
      .slice(0, 4),
    PROFILE_NAV_ITEM,
  ]);

  protected readonly initials = computed(() => {
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

  protected toggleSidebar(): void {
    this.sidebarCollapsed.update((v) => !v);
  }

  protected toggleMobileMenu(): void {
    this.mobileMenuOpen.update((v) => !v);
  }

  protected closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }

  protected async logout(): Promise<void> {
    await this.auth.logout();
  }
}

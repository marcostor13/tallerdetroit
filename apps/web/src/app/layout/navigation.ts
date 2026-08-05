import type { Permission } from '@dps/shared';

export interface NavItem {
  readonly path: string;
  readonly label: string;
  /** Etiqueta corta para la barra inferior de móvil. */
  readonly shortLabel: string;
  readonly icon: string;
  readonly permissions: readonly Permission[];
  /** Aparece en la barra inferior de móvil (máximo 5, §7.7). */
  readonly inBottomNav: boolean;
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    path: '/inicio',
    label: 'Inicio',
    shortLabel: 'Inicio',
    icon: 'home',
    permissions: [],
    inBottomNav: true,
  },
  {
    path: '/informes',
    label: 'Informes técnicos',
    shortLabel: 'Informes',
    icon: 'description',
    permissions: ['reports:read'],
    inBottomNav: true,
  },
  {
    path: '/informes/nuevo',
    label: 'Nuevo informe',
    shortLabel: 'Nuevo',
    icon: 'add_circle',
    permissions: ['reports:create'],
    inBottomNav: true,
  },
  {
    path: '/equipos',
    label: 'Equipos y motores',
    shortLabel: 'Equipos',
    icon: 'precision_manufacturing',
    permissions: ['masters:read'],
    inBottomNav: true,
  },
  {
    path: '/maestros',
    label: 'Maestros',
    shortLabel: 'Maestros',
    icon: 'inventory_2',
    permissions: ['masters:read'],
    inBottomNav: false,
  },
  {
    path: '/plantillas',
    label: 'Plantillas',
    shortLabel: 'Plantillas',
    icon: 'dashboard_customize',
    permissions: ['templates:read'],
    inBottomNav: false,
  },
  {
    path: '/analitica',
    label: 'Analítica',
    shortLabel: 'Analítica',
    icon: 'insights',
    permissions: ['analytics:read'],
    inBottomNav: false,
  },
  {
    path: '/administracion',
    label: 'Administración',
    shortLabel: 'Admin',
    icon: 'settings',
    permissions: ['users:read', 'settings:write'],
    inBottomNav: false,
  },
];

/** Quinto destino de la barra inferior: siempre el perfil. */
export const PROFILE_NAV_ITEM: NavItem = {
  path: '/perfil',
  label: 'Mi perfil',
  shortLabel: 'Perfil',
  icon: 'account_circle',
  permissions: [],
  inBottomNav: true,
};

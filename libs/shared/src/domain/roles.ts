/**
 * RBAC. Los 4 primeros roles son el núcleo obligatorio declarado por el negocio
 * (slide 8). `calidad` y `planificacion` son extensiones previstas desde F3:
 * hoy alguien hace ese trabajo informalmente.
 */
export const ROLES = [
  'administrador',
  'supervisor',
  'tecnico',
  'visor',
  'calidad',
  'planificacion',
] as const;

export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  // Informes
  'reports:read',
  'reports:create',
  'reports:update',
  'reports:submit',
  'reports:review',
  'reports:approve',
  'reports:issue',
  'reports:void',
  'reports:read:all',
  // Maestros
  'masters:read',
  'masters:write',
  'masters:merge',
  'masters:import',
  // Plantillas
  'templates:read',
  'templates:write',
  'templates:publish',
  // Administración
  'users:read',
  'users:write',
  'settings:write',
  'audit:read',
  'analytics:read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Matriz base. Es el punto de partida; los permisos efectivos se resuelven
 * contra la colección `roles`, que el Administrador puede ajustar.
 *
 * RN-07 (scoping) NO se expresa aquí: el técnico ve solo los informes donde
 * participa y el supervisor los de su unidad de negocio. Eso lo aplica el
 * repositorio, no la matriz de permisos.
 */
export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  administrador: [...PERMISSIONS],

  supervisor: [
    'reports:read',
    'reports:read:all',
    'reports:create',
    'reports:update',
    'reports:submit',
    'reports:review',
    'reports:approve',
    'reports:issue',
    'masters:read',
    'masters:write',
    'templates:read',
    'analytics:read',
  ],

  tecnico: [
    'reports:read',
    'reports:create',
    'reports:update',
    'reports:submit',
    'masters:read',
    'masters:write', // solo creación inline; el alcance real lo limita el servicio
    'templates:read',
  ],

  visor: ['reports:read', 'masters:read', 'templates:read', 'analytics:read'],

  calidad: [
    'reports:read',
    'reports:read:all',
    'templates:read',
    'templates:write',
    'templates:publish',
    'masters:read',
    'masters:write',
  ],

  planificacion: ['reports:read', 'reports:read:all', 'masters:read', 'masters:write'],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import type { Permission } from '@dps/shared';
import { AuthService } from './auth.service';

/** Exige sesión iniciada. Si no la hay, manda a login conservando el destino. */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.initialized()) await auth.restore();
  if (auth.isAuthenticated()) return true;

  return router.createUrlTree(['/login'], { queryParams: { redirectTo: state.url } });
};

/**
 * Exige uno o más permisos. Se declara en la ruta:
 *
 *   { path: 'maestros', canActivate: [authGuard, permissionGuard(['masters:read'])] }
 */
export function permissionGuard(required: readonly Permission[]): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    return auth.canAny(required) ? true : router.createUrlTree(['/sin-permiso']);
  };
}

/** Impide entrar al login si ya hay sesión. */
export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.initialized()) await auth.restore();
  return auth.isAuthenticated() ? router.createUrlTree(['/']) : true;
};

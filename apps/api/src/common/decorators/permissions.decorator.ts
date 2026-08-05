import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@dps/shared';

export const PERMISSIONS_KEY = 'dps:permissions';

/**
 * Declara los permisos que exige un endpoint.
 *
 * Es la ÚNICA forma admitida de autorizar en este proyecto: nada de
 * `if (user.rol === 'administrador')` disperso por los servicios, porque acaba
 * divergiendo y nadie puede auditar quién puede hacer qué.
 *
 *   @Permissions('reports:approve')
 *   approve(...) {}
 *
 * Basta con tener UNO de los permisos listados.
 */
export const Permissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/** Marca un endpoint como público (sin sesión). */
export const IS_PUBLIC_KEY = 'dps:isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

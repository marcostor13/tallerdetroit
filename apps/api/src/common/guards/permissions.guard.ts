import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission } from '@dps/shared';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import type { RequestWithUser } from '../decorators/current-user.decorator';

/**
 * Aplica los permisos declarados con `@Permissions()`.
 *
 * Corre DESPUÉS de `JwtAuthGuard`, así que aquí ya hay usuario. Solo comprueba
 * la matriz de permisos; el acotamiento por unidad de negocio (RN-07) es
 * responsabilidad del repositorio, porque depende de los datos, no de la ruta.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) return true;

    const user = context.switchToHttp().getRequest<RequestWithUser>().user;
    if (!user) throw new ForbiddenException('Sesión no válida.');

    const allowed = required.some((p) => user.permisos.includes(p));
    if (!allowed) {
      throw new ForbiddenException(
        `Tu rol (${user.rol}) no incluye el permiso necesario para esta acción.`,
      );
    }

    return true;
  }
}

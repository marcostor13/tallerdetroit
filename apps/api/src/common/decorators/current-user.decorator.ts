import { type ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';
import type { Permission, Role } from '@dps/shared';

export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly nombre: string;
  readonly rol: Role;
  readonly permisos: readonly Permission[];
  /** RN-07: acota qué informes ve el supervisor. */
  readonly unidadNegocioId: string | null;
  readonly tecnicoId: string | null;
}

export interface RequestWithUser extends Request {
  user?: AuthUser;
}

/** Inyecta el usuario autenticado en el método del controlador. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | undefined =>
    ctx.switchToHttp().getRequest<RequestWithUser>().user,
);

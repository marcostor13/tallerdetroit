import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission, Role } from '@dps/shared';
import { ROLE_PERMISSIONS } from '@dps/shared';
import { PermissionsGuard } from './permissions.guard';

function contextFor(rol: Role | null): ExecutionContext {
  const user =
    rol === null
      ? undefined
      : {
          id: 'u1',
          email: 'tecnico@detroitpower.pe',
          nombre: 'Reynaldo Cáceres',
          rol,
          permisos: ROLE_PERMISSIONS[rol],
          unidadNegocioId: 'un1',
          tecnicoId: 't1',
        };

  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

function guardWith(required: Permission[] | undefined): PermissionsGuard {
  const reflector = new Reflector();
  jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(required);
  return new PermissionsGuard(reflector);
}

describe('PermissionsGuard', () => {
  it('deja pasar cuando el endpoint no declara permisos', () => {
    expect(guardWith(undefined).canActivate(contextFor('visor'))).toBe(true);
    expect(guardWith([]).canActivate(contextFor('visor'))).toBe(true);
  });

  it('deja pasar al supervisor que sí puede aprobar informes', () => {
    expect(guardWith(['reports:approve']).canActivate(contextFor('supervisor'))).toBe(true);
  });

  it('bloquea al técnico intentando aprobar un informe', () => {
    expect(() => guardWith(['reports:approve']).canActivate(contextFor('tecnico'))).toThrow(
      ForbiddenException,
    );
  });

  it('bloquea al visor intentando editar (rol sin permisos de escritura, slide 8)', () => {
    expect(() => guardWith(['reports:update']).canActivate(contextFor('visor'))).toThrow(
      ForbiddenException,
    );
  });

  it('el administrador pasa cualquier permiso', () => {
    for (const permiso of ['reports:issue', 'audit:read', 'settings:write'] as Permission[]) {
      expect(guardWith([permiso]).canActivate(contextFor('administrador'))).toBe(true);
    }
  });

  it('basta con tener UNO de los permisos requeridos', () => {
    expect(
      guardWith(['users:read', 'reports:read']).canActivate(contextFor('tecnico')),
    ).toBe(true);
  });

  it('solo Calidad puede publicar versiones de plantilla', () => {
    expect(guardWith(['templates:publish']).canActivate(contextFor('calidad'))).toBe(true);
    expect(() => guardWith(['templates:publish']).canActivate(contextFor('supervisor'))).toThrow(
      ForbiddenException,
    );
  });

  it('rechaza una petición sin usuario', () => {
    expect(() => guardWith(['reports:read']).canActivate(contextFor(null))).toThrow(
      ForbiddenException,
    );
  });
});

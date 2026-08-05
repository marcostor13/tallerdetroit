import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { UsersService } from './users.service';

/**
 * Listado de usuarios. Es la primera ruta con permiso declarado, y sirve de
 * comprobación viva del RBAC: un visor recibe 403 aunque su token sea válido.
 *
 * El CRUD completo (alta, edición, bloqueo, revocación de sesiones) llega con
 * el resto de la administración.
 */
@ApiTags('users')
@ApiBearerAuth()
@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Permissions('users:read')
  @ApiOperation({ summary: 'Lista los usuarios activos' })
  async list(@CurrentUser() actor: AuthUser) {
    const usuarios = await this.users.listActive();
    return {
      total: usuarios.length,
      solicitadoPor: actor.email,
      usuarios,
    };
  }
}

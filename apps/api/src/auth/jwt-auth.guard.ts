import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { EnvironmentVariables } from '../config/configuration';
import { IS_PUBLIC_KEY } from '../common/decorators/permissions.decorator';
import type { RequestWithUser } from '../common/decorators/current-user.decorator';
import { UsersService } from '../users/users.service';

/**
 * Verifica el access token y deja el usuario en la petición.
 *
 * Recarga el usuario desde la base en cada petición en vez de confiar en el
 * contenido del token: así una desactivación o un cambio de rol surten efecto
 * de inmediato, sin esperar a que caduque el token.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
    private readonly users: UsersService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const esPublico = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (esPublico) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const header = request.headers.authorization;

    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Falta el token de acceso.');
    }

    let payload: { sub: string };
    try {
      payload = await this.jwt.verifyAsync<{ sub: string }>(header.slice(7), {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      });
    } catch {
      throw new UnauthorizedException('El token de acceso no es válido o expiró.');
    }

    const user = await this.users.findById(payload.sub);
    if (!user || !user.activo) {
      throw new UnauthorizedException('La cuenta ya no está activa.');
    }

    request.user = this.users.toAuthUser(user);
    return true;
  }
}

import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as argon2 from 'argon2';
import { createHash, randomUUID } from 'node:crypto';
import type { EnvironmentVariables } from '../config/configuration';
import { User, type UserDocument } from '../users/schemas/user.schema';
import { UsersService } from '../users/users.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import type { LoginDto } from './dto/login.dto';

export interface TokenPair {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly user: AuthUser;
}

interface RefreshPayload {
  sub: string;
  jti: string;
}

/**
 * Autenticación (§20).
 *
 * El *refresh token* es rotativo: cada renovación invalida el anterior. Se
 * guarda solo su hash SHA-256 en el usuario, de modo que una filtración de la
 * base no permite suplantar sesiones, y el Administrador puede revocarlas.
 */
@Injectable()
export class AuthService {
  /** Cuántas sesiones simultáneas se conservan por usuario. */
  private static readonly MAX_SESIONES = 5;

  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async login(dto: LoginDto, meta: { ip?: string; userAgent?: string }): Promise<TokenPair> {
    const user = await this.users.findByEmailWithSecret(dto.email);

    // Mismo mensaje si el usuario no existe o la contraseña falla: no se revela
    // qué correos están dados de alta.
    const credencialesInvalidas = new UnauthorizedException('Correo o contraseña incorrectos.');

    if (!user) {
      // Se verifica igualmente contra un hash ficticio para que el tiempo de
      // respuesta no delate si el correo existe.
      await argon2
        .verify(
          '$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0$0000000000000000000000000000000000000000000',
          dto.password,
        )
        .catch(() => false);
      throw credencialesInvalidas;
    }

    const bloqueadoHasta = user.seguridad?.bloqueadoHasta;
    if (bloqueadoHasta && bloqueadoHasta.getTime() > Date.now()) {
      const minutos = Math.ceil((bloqueadoHasta.getTime() - Date.now()) / 60_000);
      throw new HttpException(
        `La cuenta está bloqueada por intentos fallidos. Vuelve a intentarlo en ${minutos} min.`,
        HttpStatus.LOCKED,
      );
    }

    const correcta = await argon2.verify(user.passwordHash, dto.password).catch(() => false);
    if (!correcta) {
      const { bloqueada } = await this.users.registerFailedAttempt(
        user._id as Types.ObjectId,
        this.config.get('LOGIN_MAX_ATTEMPTS', { infer: true }),
        this.config.get('LOGIN_LOCKOUT_MINUTES', { infer: true }),
      );
      if (bloqueada) {
        throw new HttpException(
          'Demasiados intentos fallidos: la cuenta queda bloqueada temporalmente.',
          HttpStatus.LOCKED,
        );
      }
      throw credencialesInvalidas;
    }

    if (!user.activo) {
      throw new ForbiddenException('La cuenta está desactivada. Contacta al administrador.');
    }

    // La inscripción y verificación de TOTP llega con el resto de MFA; hasta
    // entonces el indicador queda registrado pero no exige código.

    await this.users.registerSuccessfulLogin(user._id as Types.ObjectId);
    return this.issueTokens(user, meta);
  }

  /** Renueva el par de tokens y **rota** el refresh: el anterior deja de valer. */
  async refresh(
    refreshToken: string,
    meta: { ip?: string; userAgent?: string },
  ): Promise<TokenPair> {
    const expirado = new UnauthorizedException('La sesión expiró. Vuelve a iniciar sesión.');

    let payload: RefreshPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshPayload>(refreshToken, {
        secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
      });
    } catch {
      throw expirado;
    }

    const user = await this.users.findById(payload.sub);
    if (!user || !user.activo) throw expirado;

    const hash = AuthService.hashToken(refreshToken);
    const sesion = (user.sesiones ?? []).find((s) => s.tokenHash === hash);
    if (!sesion) {
      // El token es válido pero ya no está registrado: o se roto, o fue
      // revocado. En ambos casos, la sesión no sirve.
      throw expirado;
    }

    await this.userModel.updateOne({ _id: user._id }, { $pull: { sesiones: { tokenHash: hash } } });

    return this.issueTokens(user, meta);
  }

  /** Cierra la sesión asociada a ese refresh token. */
  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    const hash = AuthService.hashToken(refreshToken);
    await this.userModel.updateOne(
      { 'sesiones.tokenHash': hash },
      { $pull: { sesiones: { tokenHash: hash } } },
    );
  }

  private async issueTokens(
    user: UserDocument,
    meta: { ip?: string; userAgent?: string },
  ): Promise<TokenPair> {
    const authUser = this.users.toAuthUser(user);
    const jti = randomUUID();

    const accessToken = await this.jwt.signAsync(
      { sub: authUser.id, email: authUser.email, rol: authUser.rol },
      {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
        expiresIn: this.config.get('JWT_ACCESS_TTL', { infer: true }),
      },
    );

    const refreshToken = await this.jwt.signAsync(
      { sub: authUser.id, jti },
      {
        secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
        expiresIn: this.config.get('JWT_REFRESH_TTL', { infer: true }),
      },
    );

    const sesion = {
      tokenHash: AuthService.hashToken(refreshToken),
      creadaEn: new Date(),
      ip: meta.ip ?? null,
      userAgent: meta.userAgent?.slice(0, 200) ?? null,
    };

    await this.userModel.updateOne(
      { _id: user._id },
      {
        $push: {
          sesiones: { $each: [sesion], $slice: -AuthService.MAX_SESIONES },
        },
      },
    );

    return { accessToken, refreshToken, user: authUser };
  }

  /** Solo se persiste el hash del refresh token, nunca el token. */
  private static hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}

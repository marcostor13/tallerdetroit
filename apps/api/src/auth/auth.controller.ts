import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { EnvironmentVariables } from '../config/configuration';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/permissions.decorator';
import { AuthService, type TokenPair } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LoginDto } from './dto/login.dto';

/** Nombre de la cookie httpOnly que transporta el refresh token. */
const REFRESH_COOKIE = 'dps_rt';

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  // Límite estricto: el login es el objetivo natural de la fuerza bruta.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Inicia sesión y devuelve el access token' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const pair = await this.auth.login(dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return this.respond(pair, res);
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renueva el access token rotando el refresh' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    const pair = await this.auth.refresh(token ?? '', {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return this.respond(pair, res);
  }

  @Post('logout')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cierra la sesión y revoca el refresh token' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const token = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    await this.auth.logout(token);
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Devuelve el usuario de la sesión actual' })
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }

  /**
   * El access token viaja en el cuerpo (el frontend lo guarda en memoria) y el
   * refresh en una cookie httpOnly que JavaScript no puede leer (§20).
   */
  private respond(pair: TokenPair, res: Response) {
    res.cookie(REFRESH_COOKIE, pair.refreshToken, {
      ...this.cookieOptions(),
      maxAge: this.refreshTtlMs(),
    });
    return { accessToken: pair.accessToken, user: pair.user };
  }

  private cookieOptions() {
    const production = this.config.get('NODE_ENV', { infer: true }) === 'production';
    return {
      httpOnly: true,
      secure: production,
      // El frontend vive en otro subdominio que la API, así que `strict`
      // impediría enviar la cookie. `lax` sigue bloqueando el envío en
      // peticiones de terceros iniciadas desde otro sitio.
      sameSite: 'lax' as const,
      path: '/api/v1/auth',
    };
  }

  /** Convierte `7d` / `15m` / `3600s` a milisegundos. */
  private refreshTtlMs(): number {
    const ttl = this.config.get('JWT_REFRESH_TTL', { infer: true });
    const match = /^(\d+)([smhd])$/.exec(ttl);
    if (!match) return 7 * 24 * 60 * 60 * 1000;
    const valor = Number(match[1]);
    const unidad = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2] as 's'];
    return valor * unidad;
  }
}

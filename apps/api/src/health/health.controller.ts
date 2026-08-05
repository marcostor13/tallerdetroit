import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  type HealthCheckResult,
  MongooseHealthIndicator,
} from '@nestjs/terminus';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/permissions.decorator';

/**
 * Healthcheck que consultan Docker, Coolify y el workflow de despliegue.
 * Es público a propósito: el orquestador no tiene sesión.
 *
 * Comprueba **dependencias**, no el estado interno del proceso. Antes incluía un
 * límite de heap y eso es peligroso: durante un render de PDF la memoria sube
 * (Chromium usa 300–600 MB), el endpoint devolvería 503 y Coolify reiniciaría o
 * revertiría un servicio que está atendiendo peticiones sin problema. El consumo
 * de memoria se vigila con el límite del contenedor y con Sentry, que es donde
 * corresponde.
 */
@ApiTags('health')
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly mongoose: MongooseHealthIndicator,
  ) {}

  @Get()
  @Public()
  @HealthCheck()
  @ApiOperation({ summary: 'Estado del servicio y sus dependencias' })
  check(): Promise<HealthCheckResult> {
    return this.health.check([() => this.mongoose.pingCheck('mongodb', { timeout: 3000 })]);
  }

  @Get('live')
  @Public()
  @ApiOperation({ summary: 'Liveness: el proceso responde' })
  live(): { status: string } {
    return { status: 'ok' };
  }
}

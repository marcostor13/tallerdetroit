import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  type HealthCheckResult,
  MemoryHealthIndicator,
  MongooseHealthIndicator,
} from '@nestjs/terminus';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/permissions.decorator';

/**
 * Healthcheck que consultan Docker, Coolify y el workflow de despliegue.
 * Es público a propósito: el orquestador no tiene sesión.
 */
@ApiTags('health')
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly mongoose: MongooseHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
  ) {}

  @Get()
  @Public()
  @HealthCheck()
  @ApiOperation({ summary: 'Estado del servicio y sus dependencias' })
  check(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.mongoose.pingCheck('mongodb', { timeout: 3000 }),
      () => this.memory.checkHeap('memoria_heap', 400 * 1024 * 1024),
    ]);
  }

  @Get('live')
  @Public()
  @ApiOperation({ summary: 'Liveness: el proceso responde' })
  live(): { status: string } {
    return { status: 'ok' };
  }
}

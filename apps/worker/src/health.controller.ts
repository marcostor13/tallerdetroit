import { Controller, Get } from '@nestjs/common';

interface WorkerHealth {
  status: 'ok';
  service: 'worker';
  uptimeSeconds: number;
  memoryMb: number;
}

/**
 * El worker no expone API de negocio: solo consume colas. Este endpoint existe
 * únicamente para el HEALTHCHECK de Docker y Coolify.
 */
@Controller('health')
export class HealthController {
  @Get()
  check(): WorkerHealth {
    return {
      status: 'ok',
      service: 'worker',
      uptimeSeconds: Math.round(process.uptime()),
      memoryMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    };
  }
}

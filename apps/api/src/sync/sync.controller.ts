import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { SyncService, type OperacionEntrante } from './sync.service';
import { ReportsService } from '../reports/reports.service';

@ApiTags('Sincronización')
@ApiBearerAuth()
@Controller({ path: 'sync', version: '1' })
export class SyncController {
  constructor(
    private readonly sync: SyncService,
    private readonly informes: ReportsService,
  ) {}

  @Post('push')
  @Permissions('reports:update')
  @ApiOperation({
    summary: 'Sube lo capturado sin conexión (E4.4)',
    description:
      'Cada operación lleva su `clientOpId`: reenviar la misma no crea nada dos ' +
      'veces. Se aplican una a una, así que una que falle no se lleva por delante ' +
      'las demás — vuelve sola a la cola del dispositivo.',
  })
  push(
    @Body() body: { operaciones?: OperacionEntrante[] },
    @CurrentUser() actor: AuthUser,
  ) {
    return this.sync.push(body.operaciones ?? [], actor);
  }

  @Get('pull')
  @Permissions('reports:read')
  @ApiQuery({ name: 'desde', required: false, description: 'ISO-8601' })
  @ApiOperation({
    summary: 'Trae lo que cambió en el servidor desde la última sincronización',
    description:
      'Delta y no volcado completo: un técnico con cincuenta informes en su ' +
      'unidad no puede descargarlos enteros cada vez que abre la app con red.',
  })
  async pull(@Query('desde') desde?: string) {
    const { items } = await this.informes.list({ desde, limit: 200 });
    return { desde: desde ?? null, hasta: new Date().toISOString(), informes: items };
  }
}

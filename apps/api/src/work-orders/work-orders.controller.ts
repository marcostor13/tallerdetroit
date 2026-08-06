import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { WorkOrdersService } from './work-orders.service';
import type { WorkOrderState } from './schemas/work-order.schema';

@ApiTags('work-orders')
@ApiBearerAuth()
@Controller({ path: 'work-orders', version: '1' })
export class WorkOrdersController {
  constructor(private readonly ordenes: WorkOrdersService) {}

  @Get()
  @Permissions('reports:read')
  @ApiQuery({ name: 'q', required: false, description: 'Parte del número de O/T' })
  @ApiQuery({ name: 'estado', required: false })
  @ApiOperation({ summary: 'Lista órdenes de trabajo' })
  list(
    @Query('q') q?: string,
    @Query('estado') estado?: WorkOrderState,
    @Query('clienteId') clienteId?: string,
    @Query('equipoId') equipoId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.ordenes.list({
      q,
      estado,
      clienteId,
      equipoId,
      limit: limit ? Number(limit) : undefined,
    });
  }

  /**
   * Va antes que `:id` a propósito: Nest resuelve por orden de declaración y
   * `sugerir-numero` encajaría en `:id`.
   */
  @Get('sugerir-numero')
  @Permissions('reports:create')
  @ApiQuery({ name: 'prefijo', required: false, description: 'Por ejemplo «LIM-TAL»' })
  @ApiOperation({
    summary: 'Propone el siguiente número a partir del último dado de alta',
    description:
      'Ayuda para teclear menos, no un generador de correlativos: el campo sigue ' +
      'siendo editable y no se reserva nada (decisión D3).',
  })
  sugerirNumero(@Query('prefijo') prefijo?: string) {
    return this.ordenes.sugerirNumero(prefijo);
  }

  @Get('numero/:numero')
  @Permissions('reports:read')
  @ApiOperation({ summary: 'Busca por número, que es como la conoce el técnico' })
  findByNumero(@Param('numero') numero: string) {
    return this.ordenes.findByNumero(numero);
  }

  @Get(':id')
  @Permissions('reports:read')
  @ApiOperation({ summary: 'Devuelve una orden de trabajo' })
  findById(@Param('id') id: string) {
    return this.ordenes.findById(id);
  }

  @Post()
  @Permissions('reports:create')
  @ApiOperation({ summary: 'Crea una orden de trabajo' })
  create(@Body() body: Record<string, unknown>, @CurrentUser() actor: AuthUser) {
    return this.ordenes.create(body, actor);
  }

  @Patch(':id')
  @Permissions('reports:update')
  @ApiOperation({ summary: 'Actualiza una orden de trabajo' })
  update(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.ordenes.update(id, body, actor);
  }

  @Delete(':id')
  @Permissions('reports:update')
  @ApiOperation({ summary: 'Da de baja una orden de trabajo (soft delete)' })
  remove(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.ordenes.remove(id, actor);
  }
}

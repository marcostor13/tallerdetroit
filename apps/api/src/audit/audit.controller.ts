import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../common/decorators/permissions.decorator';
import { AuditService } from './audit.service';

@ApiTags('Auditoría')
@Controller({ path: 'audit', version: '1' })
export class AuditController {
  constructor(private readonly auditoria: AuditService) {}

  @Get()
  @Permissions('audit:read')
  @ApiOperation({
    summary: 'Consulta de auditoría',
    description:
      'Filtra por actor, entidad, acción y rango de fechas. El «hasta» es ' +
      'inclusive: quien pide «hasta el 6» quiere lo del día 6.',
  })
  @ApiQuery({ name: 'actorId', required: false })
  @ApiQuery({ name: 'entidad', required: false })
  @ApiQuery({ name: 'entidadId', required: false })
  @ApiQuery({ name: 'accion', required: false })
  @ApiQuery({ name: 'desde', required: false, description: 'ISO-8601' })
  @ApiQuery({ name: 'hasta', required: false, description: 'ISO-8601' })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'skip', required: false })
  consultar(
    @Query('actorId') actorId?: string,
    @Query('entidad') entidad?: string,
    @Query('entidadId') entidadId?: string,
    @Query('accion') accion?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    return this.auditoria.consultar({
      ...(actorId ? { actorId } : {}),
      ...(entidad ? { entidad } : {}),
      ...(entidadId ? { entidadId } : {}),
      ...(accion ? { accion } : {}),
      ...(desde ? { desde } : {}),
      ...(hasta ? { hasta } : {}),
      ...(limit ? { limit: Number(limit) } : {}),
      ...(skip ? { skip: Number(skip) } : {}),
    });
  }

  @Get(':entidad/:entidadId')
  @Permissions('audit:read')
  @ApiOperation({ summary: 'Historial completo de una entidad, de lo nuevo a lo viejo' })
  historial(@Param('entidad') entidad: string, @Param('entidadId') entidadId: string) {
    return this.auditoria.historialDe(entidad, entidadId);
  }
}

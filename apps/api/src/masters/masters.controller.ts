import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { MASTER_KEYS } from './master-registry';
import { MastersService } from './masters.service';

/**
 * Un único controlador para los maestros de §13.
 *
 * Todos comparten comportamiento, así que se describen en `master-registry` en
 * lugar de escribir un controlador por catálogo. Añadir un maestro nuevo no
 * toca este archivo.
 */
@ApiTags('masters')
@ApiBearerAuth()
@Controller({ path: 'masters', version: '1' })
export class MastersController {
  constructor(private readonly masters: MastersService) {}

  @Get()
  @Permissions('masters:read')
  @ApiOperation({ summary: 'Lista los maestros disponibles' })
  catalogos() {
    return {
      total: MASTER_KEYS.length,
      maestros: MASTER_KEYS,
    };
  }

  @Get(':collection')
  @Permissions('masters:read')
  @ApiParam({ name: 'collection', enum: MASTER_KEYS })
  @ApiQuery({ name: 'q', required: false, description: 'Búsqueda tolerante a erratas' })
  @ApiQuery({ name: 'limit', required: false })
  @ApiOperation({ summary: 'Lista con búsqueda difusa y filtros de cascada' })
  list(@Param('collection') collection: string, @Query() query: Record<string, string>) {
    // Se toma la query completa: lo que no son opciones son los filtros de
    // cascada (clienteId, sedeId, categoria…), que el registro de cada maestro
    // declara en `filterFields`.
    const { q, limit, incluirInactivos, ...filtros } = query;

    return this.masters.list(collection, {
      q,
      limit: limit ? Number(limit) : undefined,
      incluirInactivos: incluirInactivos === 'true',
      filtros,
    });
  }

  @Get(':collection/:id')
  @Permissions('masters:read')
  @ApiOperation({ summary: 'Devuelve un registro' })
  findById(@Param('collection') collection: string, @Param('id') id: string) {
    return this.masters.findById(collection, id);
  }

  @Post(':collection')
  @Permissions('masters:write')
  @ApiQuery({
    name: 'inline',
    required: false,
    description: 'Creación rápida desde el formulario del informe (§13.3.1)',
  })
  @ApiOperation({ summary: 'Crea un registro' })
  create(
    @Param('collection') collection: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() actor: AuthUser,
    @Query('inline') inline?: string,
  ) {
    return this.masters.create(collection, body, actor, inline === 'true');
  }

  @Patch(':collection/:id')
  @Permissions('masters:write')
  @ApiOperation({ summary: 'Actualiza un registro' })
  update(
    @Param('collection') collection: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.masters.update(collection, id, body, actor);
  }

  @Delete(':collection/:id')
  @Permissions('masters:write')
  @ApiOperation({ summary: 'Da de baja un registro (soft delete)' })
  remove(
    @Param('collection') collection: string,
    @Param('id') id: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.masters.remove(collection, id, actor);
  }
}

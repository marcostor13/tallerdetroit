import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { MASTER_KEYS } from './master-registry';
import { MastersService } from './masters.service';
import { MastersImportService } from './masters-import.service';

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
  constructor(
    private readonly masters: MastersService,
    private readonly importador: MastersImportService,
  ) {}

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

  /**
   * Va antes que `:collection/:id` a propósito: con el orden al revés, Nest
   * resolvería `/clients/delta` como «el cliente con id `delta`».
   */
  @Get(':collection/delta')
  @Permissions('masters:read')
  @ApiParam({ name: 'collection', enum: MASTER_KEYS })
  @ApiQuery({
    name: 'desde',
    required: false,
    description: 'ISO de la última sincronización. Sin él, se manda el catálogo entero',
  })
  @ApiQuery({ name: 'limit', required: false })
  @ApiOperation({
    summary: 'Cambios desde una fecha, para la caché del dispositivo (E4.2)',
    description:
      'Incluye las bajas y las desactivaciones: el dispositivo tiene que poder quitar de su ' +
      'caché lo que ya no se puede elegir.',
  })
  delta(
    @Param('collection') collection: string,
    @Query('desde') desde?: string,
    @Query('limit') limit?: string,
  ) {
    return this.masters.delta(collection, desde, limit ? Number(limit) : undefined);
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

  @Post(':collection/importar')
  @Permissions('masters:import')
  @ApiQuery({
    name: 'simulacion',
    required: false,
    description: 'Comprueba el archivo sin escribir nada',
  })
  @ApiQuery({
    name: 'clave',
    required: false,
    description: 'Campo por el que se identifica la fila',
  })
  @ApiOperation({
    summary: 'Carga masiva desde CSV',
    description:
      'Una fila con errores no tumba el archivo: se importa lo demás y se ' +
      'devuelve la lista de fallos con su número de línea.',
  })
  importar(
    @Param('collection') collection: string,
    @Body() body: { csv: string },
    @CurrentUser() actor: AuthUser,
    @Query('simulacion') simulacion?: string,
    @Query('clave') clave?: string,
  ) {
    return this.importador.importar(collection, body.csv ?? '', actor, {
      simulacion: simulacion === 'true',
      claveUnica: clave,
    });
  }

  @Post(':collection/fusionar')
  @Permissions('masters:merge')
  @ApiOperation({
    summary: 'Fusiona dos registros duplicados',
    description:
      'Reapunta las referencias al superviviente y da de baja el sobrante sin ' +
      'borrarlo: los informes emitidos guardan su identificador (§13.3.5).',
  })
  fusionar(
    @Param('collection') collection: string,
    @Body() body: { queda: string; sobrante: string },
    @CurrentUser() actor: AuthUser,
  ) {
    return this.importador.fusionar(collection, body.queda, body.sobrante, actor);
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

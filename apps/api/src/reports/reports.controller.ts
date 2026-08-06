import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { ReportStatus } from '@dps/shared';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { ReportsService } from './reports.service';
import { MeasurementFactsService } from './measurement-facts.service';

@ApiTags('reports')
@ApiBearerAuth()
@Controller({ path: 'reports', version: '1' })
export class ReportsController {
  constructor(
    private readonly informes: ReportsService,
    private readonly hechos: MeasurementFactsService,
  ) {}

  /**
   * La consulta que justifica toda la colección analítica (§16.3): cómo ha
   * evolucionado un parámetro de un motor a lo largo de sus intervenciones.
   * Un solo índice y milisegundos, en vez de abrir todos sus informes.
   */
  @Get('series/:motorSerie/:parametro')
  @Permissions('reports:read')
  @ApiQuery({ name: 'fila', required: false })
  @ApiQuery({ name: 'columna', required: false })
  @ApiOperation({ summary: 'Serie histórica de un parámetro para un motor' })
  serieHistorica(
    @Param('motorSerie') motorSerie: string,
    @Param('parametro') parametro: string,
    @Query('fila') fila?: string,
    @Query('columna') columna?: string,
  ) {
    return this.hechos.serieHistorica(motorSerie, parametro, { fila, columna });
  }

  @Get()
  @Permissions('reports:read')
  @ApiQuery({ name: 'q', required: false, description: 'N° de informe o de O/T' })
  @ApiQuery({ name: 'estado', required: false })
  @ApiOperation({ summary: 'Bandeja de informes con filtros' })
  list(
    @Query('q') q?: string,
    @Query('estado') estado?: ReportStatus,
    @Query('clienteId') clienteId?: string,
    @Query('equipoId') equipoId?: string,
    @Query('motorId') motorId?: string,
    @Query('tecnicoId') tecnicoId?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('limit') limit?: string,
  ) {
    return this.informes.list({
      q,
      estado,
      clienteId,
      equipoId,
      motorId,
      tecnicoId,
      desde,
      hasta,
      limit: limit ? Number(limit) : undefined,
    });
  }

  /**
   * La relación 1..n de E1.3: una misma orden genera el informe de evaluación y
   * después el de reparación, y hasta ahora no había forma de saber que hablaban
   * del mismo trabajo.
   */
  @Get('por-orden/:workOrderId')
  @Permissions('reports:read')
  @ApiOperation({ summary: 'Informes de una orden de trabajo' })
  porOrden(@Param('workOrderId') workOrderId: string) {
    return this.informes.listByWorkOrder(workOrderId);
  }

  @Get(':id')
  @Permissions('reports:read')
  @ApiOperation({
    summary: 'Informe completo',
    description: 'Las fotos llegan con su número de figura ya calculado desde el orden (RN-06).',
  })
  findById(@Param('id') id: string) {
    return this.informes.findById(id);
  }

  @Get(':id/validacion')
  @Permissions('reports:read')
  @ApiOperation({
    summary: 'Qué falta para poder emitir',
    description:
      'Devuelve la lista completa con el paso al que lleva cada punto, para que el ' +
      'aviso sea navegable por clic en vez de un «faltan datos» (UX-07).',
  })
  validar(@Param('id') id: string) {
    return this.informes.validate(id);
  }

  @Get(':id/conclusiones-sugeridas')
  @Permissions('reports:read')
  @ApiOperation({
    summary: 'Conclusiones propuestas desde las mediciones (§12.4.4)',
    description:
      'Una propuesta por bloque evaluado, ordenadas de más grave a menos, mas las ' +
      'frases mas usadas en informes ya emitidos (UX-09).',
  })
  conclusionesSugeridas(@Param('id') id: string) {
    return this.informes.conclusionesSugeridas(id);
  }

  @Get('frases/:clave')
  @Permissions('reports:read')
  @ApiQuery({ name: 'q', required: false })
  @ApiOperation({ summary: 'Frases ya escritas en informes emitidos, por frecuencia' })
  frases(@Param('clave') clave: 'conclusiones' | 'recomendaciones', @Query('q') q?: string) {
    return this.informes.frasesFrecuentes(clave, q ?? '');
  }

  @Post()
  @Permissions('reports:create')
  @ApiOperation({ summary: 'Crea un informe desde la versión vigente de la plantilla' })
  create(@Body() body: Record<string, unknown>, @CurrentUser() actor: AuthUser) {
    return this.informes.create(body, actor);
  }

  @Patch(':id')
  @Permissions('reports:update')
  @ApiOperation({
    summary: 'Autoguardado incremental',
    description:
      'Escribe solo los campos recibidos. Devuelve `guardadoEn` para el indicador ' +
      '«Guardado hace X» del wizard (UX-01).',
  })
  patch(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.informes.patch(id, body, actor);
  }

  @Post(':id/bloques')
  @Permissions('reports:update')
  @ApiOperation({ summary: 'Añade un bloque del catálogo de la plantilla' })
  addBlock(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.informes.addBlock(id, body, actor);
  }

  @Patch(':id/bloques/:bloqueId')
  @Permissions('reports:update')
  @ApiOperation({ summary: 'Edita un bloque' })
  updateBlock(
    @Param('id') id: string,
    @Param('bloqueId') bloqueId: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.informes.updateBlock(id, bloqueId, body, actor);
  }

  @Post(':id/bloques/:bloqueId/mediciones')
  @Permissions('reports:update')
  @ApiOperation({
    summary: 'Guarda una grilla de medición',
    description:
      'Llegan los valores en crudo; los estados, el veredicto y la tolerancia ' +
      'aplicada los calcula el servidor y quedan congelados en la grilla (§12.4.3).',
  })
  guardarMedicion(
    @Param('id') id: string,
    @Param('bloqueId') bloqueId: string,
    @Body()
    body: { plantilla: string; valores: Record<string, number | null>; justificacion?: string },
    @CurrentUser() actor: AuthUser,
  ) {
    return this.informes.guardarMedicion(id, bloqueId, body, actor);
  }

  @Delete(':id/bloques/:bloqueId/mediciones/:plantilla')
  @Permissions('reports:update')
  @ApiOperation({
    summary: 'Quita una grilla de medición del bloque',
    description:
      'Una tabla añadida por error saldría vacía en el PDF, y eso parece un ' +
      'trabajo a medias en vez de un componente que no se midió.',
  })
  quitarMedicion(
    @Param('id') id: string,
    @Param('bloqueId') bloqueId: string,
    @Param('plantilla') plantilla: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.informes.quitarMedicion(id, bloqueId, plantilla, actor);
  }

  @Delete(':id/bloques/:bloqueId')
  @Permissions('reports:update')
  @ApiOperation({ summary: 'Quita un bloque y renumera las figuras' })
  removeBlock(
    @Param('id') id: string,
    @Param('bloqueId') bloqueId: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.informes.removeBlock(id, bloqueId, actor);
  }

  @Post(':id/bloques/reordenar')
  @Permissions('reports:update')
  @ApiOperation({
    summary: 'Mueve un bloque de posición',
    description:
      'Por índices, que es lo que producen tanto el arrastre como el movimiento ' +
      'por teclado. Las figuras se renumeran solas (RN-06).',
  })
  reorder(
    @Param('id') id: string,
    @Body() body: { desde: number; hasta: number },
    @CurrentUser() actor: AuthUser,
  ) {
    return this.informes.reorderBlocks(id, Number(body.desde), Number(body.hasta), actor);
  }

  @Post(':id/estado')
  @Permissions('reports:submit')
  @ApiOperation({
    summary: 'Cambia el estado del informe',
    description: 'Al emitir se valida la completitud y se congela la plantilla (§11.1).',
  })
  transition(
    @Param('id') id: string,
    @Body() body: { estado: ReportStatus; comentario?: string },
    @CurrentUser() actor: AuthUser,
  ) {
    return this.informes.transition(id, body.estado, body.comentario ?? null, actor);
  }

  @Delete(':id')
  @Permissions('reports:update')
  @ApiOperation({ summary: 'Da de baja un borrador (soft delete)' })
  remove(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.informes.remove(id, actor);
  }
}

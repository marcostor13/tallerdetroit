import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/permissions.decorator';
import { ReportsService } from './reports.service';

/**
 * Verificación pública de un informe emitido (E3.6).
 *
 * Es lo que abre el QR del pie del PDF: alguien con el papel delante —el
 * cliente, una auditoría, un tercero— comprueba que el documento salió de la
 * plataforma y que sigue vigente.
 *
 * **Pública a propósito**, porque un QR que exige credenciales no lo escanea
 * nadie. Y por eso devuelve solo lo que identifica al documento —número,
 * cliente, equipo, fecha, estado y hash— y nada del contenido técnico: quien
 * llega aquí no es necesariamente quien puede leer las mediciones del motor de
 * un cliente.
 *
 * Con límite de peticiones más estricto que el resto: sin credenciales, esta
 * ruta es la única por la que se podría intentar enumerar números de informe.
 */
@ApiTags('Verificación')
@Controller({ path: 'verificacion', version: '1' })
export class VerificacionController {
  constructor(private readonly informes: ReportsService) {}

  @Get(':numeroInforme')
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Comprueba que un informe emitido es auténtico',
    description:
      'Sin autenticación: es el destino del QR del documento. Devuelve lo que ' +
      'identifica al informe y su hash, no su contenido.',
  })
  verificar(@Param('numeroInforme') numeroInforme: string) {
    return this.informes.verificar(numeroInforme);
  }
}

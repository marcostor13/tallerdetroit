import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { MediaService } from './media.service';

@ApiTags('media')
@ApiBearerAuth()
@Controller({ path: 'media', version: '1' })
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('informes/:informeId/subida')
  @Permissions('reports:update')
  @ApiOperation({
    summary: 'URL prefirmada para subir una fotografía',
    description:
      'El navegador sube directamente a S3. Las fotos no atraviesan la API: ' +
      '45 fotos por informe la tumbarían con dos técnicos trabajando a la vez.',
  })
  firmarSubida(
    @Param('informeId') informeId: string,
    @Body() body: { tipo: string },
    @CurrentUser() actor: AuthUser,
  ) {
    return this.media.firmarSubida(informeId, body.tipo, actor);
  }

  @Post('lectura')
  @Permissions('reports:read')
  @ApiOperation({ summary: 'URLs temporales de lectura para la vista previa' })
  async firmarLectura(@Body() body: { claves: string[] }) {
    const claves = body.claves ?? [];
    const urls = await Promise.all(claves.map((clave) => this.media.firmarLectura(clave)));
    return Object.fromEntries(claves.map((clave, i) => [clave, urls[i]]));
  }
}

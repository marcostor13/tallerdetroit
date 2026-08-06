import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { TemplateSectionDefinition, VisibilityContext } from '@dps/shared';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { TemplatesService } from './templates.service';

/**
 * Plantillas de informe (§11).
 *
 * Leer es cosa de cualquiera que redacte un informe; publicar es cosa de
 * Calidad, y por eso va con `templates:write`: una versión publicada queda
 * congelada y puede acabar dentro de documentos firmados.
 */
@ApiTags('templates')
@ApiBearerAuth()
@Controller({ path: 'templates', version: '1' })
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  @Permissions('templates:read')
  @ApiOperation({ summary: 'Lista las plantillas del catálogo' })
  list() {
    return this.templates.listTemplates();
  }

  @Get(':codigo/versiones')
  @Permissions('templates:read')
  @ApiOperation({ summary: 'Versiones de una plantilla' })
  versiones(@Param('codigo') codigo: string) {
    return this.templates.listVersions(codigo);
  }

  @Get(':codigo/vigente')
  @Permissions('templates:read')
  @ApiOperation({ summary: 'Versión publicada con la que se crean los informes nuevos' })
  vigente(@Param('codigo') codigo: string) {
    return this.templates.vigente(codigo);
  }

  @Get(':codigo/versiones/:version')
  @Permissions('templates:read')
  @ApiOperation({ summary: 'Una versión concreta, publicada o no' })
  version(@Param('codigo') codigo: string, @Param('version') version: string) {
    return this.templates.findVersion(codigo, version);
  }

  @Post(':codigo/resolver')
  @Permissions('templates:read')
  @ApiOperation({
    summary: 'Secciones y bloques que le tocan a un informe concreto',
    description:
      'Aplica las reglas de visibilidad de §11.3 contra el contexto del informe ' +
      '(equipo, motor, intervención). El wizard resuelve lo mismo en local; este ' +
      'endpoint es la versión que manda si alguna vez discrepan.',
  })
  resolver(@Param('codigo') codigo: string, @Body() contexto: VisibilityContext) {
    return this.templates.resolve(codigo, contexto ?? {});
  }

  @Post(':codigo/versiones')
  @Permissions('templates:write')
  @ApiOperation({ summary: 'Crea una versión en borrador' })
  crearVersion(
    @Param('codigo') codigo: string,
    @Body() body: { version: string; nombre?: string; secciones?: TemplateSectionDefinition[] },
    @CurrentUser() actor: AuthUser,
  ) {
    return this.templates.createVersion(codigo, body, actor);
  }

  @Patch(':codigo/versiones/:version')
  @Permissions('templates:write')
  @ApiOperation({ summary: 'Edita las secciones de una versión en borrador' })
  editarVersion(
    @Param('codigo') codigo: string,
    @Param('version') version: string,
    @Body() body: { secciones: TemplateSectionDefinition[] },
    @CurrentUser() actor: AuthUser,
  ) {
    return this.templates.updateVersion(codigo, version, body.secciones ?? [], actor);
  }

  @Post(':codigo/versiones/:version/publicar')
  @Permissions('templates:publish')
  @ApiOperation({ summary: 'Publica la versión tras comprobar que es coherente' })
  publicar(
    @Param('codigo') codigo: string,
    @Param('version') version: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.templates.publish(codigo, version, actor);
  }
}

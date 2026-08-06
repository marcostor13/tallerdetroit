import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ReportTemplate,
  ReportTemplateSchema,
  TemplateVersion,
  TemplateVersionSchema,
} from './schemas/template.schema';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ReportTemplate.name, schema: ReportTemplateSchema },
      { name: TemplateVersion.name, schema: TemplateVersionSchema },
    ]),
  ],
  controllers: [TemplatesController],
  providers: [TemplatesService],
  exports: [TemplatesService, MongooseModule],
})
export class TemplatesModule {}

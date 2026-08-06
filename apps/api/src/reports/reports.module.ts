import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Report, ReportSchema } from './schemas/report.schema';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { MeasurementsService } from './measurements.service';
import { TemplatesModule } from '../templates/templates.module';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Report.name, schema: ReportSchema }]),
    // El informe se edita y se renderiza contra su plantilla: sin ella no sabe
    // qué bloques admite ni qué es obligatorio.
    TemplatesModule,
    DocumentsModule,
  ],
  controllers: [ReportsController],
  providers: [ReportsService, MeasurementsService],
  exports: [ReportsService, MeasurementsService, MongooseModule],
})
export class ReportsModule {}

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Report, ReportSchema } from './schemas/report.schema';
import { MeasurementFact, MeasurementFactSchema } from './schemas/measurement-fact.schema';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { MeasurementsService } from './measurements.service';
import { ChecklistService } from './checklist.service';
import { ReviewService } from './review.service';
import { MeasurementFactsService } from './measurement-facts.service';
import { TemplatesModule } from '../templates/templates.module';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Report.name, schema: ReportSchema },
      { name: MeasurementFact.name, schema: MeasurementFactSchema },
    ]),
    // El informe se edita y se renderiza contra su plantilla: sin ella no sabe
    // qué bloques admite ni qué es obligatorio.
    TemplatesModule,
    DocumentsModule,
  ],
  controllers: [ReportsController],
  providers: [
    ReportsService,
    MeasurementsService,
    MeasurementFactsService,
    ChecklistService,
    ReviewService,
  ],
  exports: [
    ReportsService,
    MeasurementsService,
    MeasurementFactsService,
    ChecklistService,
    ReviewService,
    MongooseModule,
  ],
})
export class ReportsModule {}

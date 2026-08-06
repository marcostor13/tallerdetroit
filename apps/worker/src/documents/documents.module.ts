import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { COLA_DOCUMENTOS, DocumentsProcessor } from './documents.processor';
import { PdfRenderer } from './pdf.renderer';

@Module({
  imports: [BullModule.registerQueue({ name: COLA_DOCUMENTOS })],
  providers: [DocumentsProcessor, PdfRenderer],
  exports: [PdfRenderer],
})
export class DocumentsModule {}

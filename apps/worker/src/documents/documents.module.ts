import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { COLA_DOCUMENTOS, DocumentsProcessor } from './documents.processor';
import { PdfRenderer } from './pdf.renderer';
import { DocxRenderer } from './docx.renderer';

@Module({
  imports: [BullModule.registerQueue({ name: COLA_DOCUMENTOS })],
  providers: [DocumentsProcessor, PdfRenderer, DocxRenderer],
  exports: [PdfRenderer],
})
export class DocumentsModule {}

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { COLA_DOCUMENTOS, DocumentsService } from './documents.service';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [BullModule.registerQueue({ name: COLA_DOCUMENTOS }), MediaModule],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}

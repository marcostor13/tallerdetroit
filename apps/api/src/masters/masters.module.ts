import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MASTERS } from './master-registry';
import { MastersController } from './masters.controller';
import { MastersService } from './masters.service';
import { MastersImportService } from './masters-import.service';

/**
 * Registra de una vez los modelos de todos los maestros descritos en
 * `master-registry`. Añadir un catálogo nuevo es añadir una entrada allí; este
 * archivo no cambia.
 */
@Module({
  imports: [MongooseModule.forFeature(MASTERS.map((m) => ({ name: m.model, schema: m.schema })))],
  controllers: [MastersController],
  providers: [MastersService, MastersImportService],
  exports: [MastersService, MastersImportService, MongooseModule],
})
export class MastersModule {}

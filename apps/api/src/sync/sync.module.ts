import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AppliedOp, AppliedOpSchema } from './schemas/applied-op.schema';
import { SyncService } from './sync.service';
import { SyncController } from './sync.controller';
import { ReportsModule } from '../reports/reports.module';

/**
 * Sincronización de lo capturado sin red (E4.4).
 *
 * Depende de `ReportsModule` a propósito: las operaciones offline se aplican con
 * el mismo servicio de dominio que las de siempre. Una vía paralela de escritura
 * se saltaría la validación, la auditoría y las reglas de negocio, y lo
 * capturado sin red acabaría siendo de peor calidad que lo capturado con red.
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: AppliedOp.name, schema: AppliedOpSchema }]),
    ReportsModule,
  ],
  controllers: [SyncController],
  providers: [SyncService],
  exports: [SyncService],
})
export class SyncModule {}

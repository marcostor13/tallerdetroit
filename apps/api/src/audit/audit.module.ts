import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditLog, AuditLogSchema } from './schemas/audit-log.schema';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';

/**
 * Auditoría (E3.8).
 *
 * Es `@Global` a propósito: la regla del proyecto es que **toda escritura
 * relevante** deje registro, y eso significa que casi cualquier módulo va a
 * necesitar el servicio. Importarlo uno a uno invita a que el módulo nuevo se
 * olvide, y un log de auditoría con huecos no sirve para lo que existe.
 */
@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: AuditLog.name, schema: AuditLogSchema }])],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}

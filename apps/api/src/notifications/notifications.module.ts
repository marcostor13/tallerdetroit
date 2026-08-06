import { Global, Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

/**
 * Avisos del flujo de aprobación (E3.9).
 *
 * `@Global` por lo mismo que la auditoría: cualquier módulo de dominio puede
 * necesitar avisar, y tener que acordarse de importarlo es la vía más corta a
 * que un flujo nuevo no avise a nadie.
 */
@Global()
@Module({
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}

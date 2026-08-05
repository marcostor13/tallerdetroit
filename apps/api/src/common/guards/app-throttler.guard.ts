import { type ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Limitador de peticiones de la aplicación.
 *
 * Se desactiva únicamente cuando `NODE_ENV=test`: las pruebas de autenticación
 * hacen decenas de inicios de sesión seguidos y agotarían el límite, que en
 * producción es precisamente lo que se quiere que ocurra.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected override shouldSkip(context: ExecutionContext): Promise<boolean> {
    if (process.env['NODE_ENV'] === 'test') return Promise.resolve(true);
    return super.shouldSkip(context);
  }
}

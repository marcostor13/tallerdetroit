import { HttpErrorResponse } from '@angular/common/http';

/**
 * ¿Falló por la red?
 *
 * Es la distinción de la que cuelga todo el modo sin conexión, y por eso vive
 * en un solo sitio: si cada pantalla la decidiera por su cuenta, una acabaría
 * encolando un error de validación y el técnico se quedaría con un pendiente
 * eterno que no puede resolver.
 *
 * `status === 0` es lo que da el navegador cuando la petición ni salió: sin
 * conexión, DNS caído, CORS que ni llegó. Un 5xx también cuenta —el servidor
 * está, pero no puede— y reintentarlo tiene sentido. Un 4xx no: eso es que la
 * petición está mal y volverá a estarlo dentro de una semana.
 */
export function esFalloDeRed(error: unknown): boolean {
  if (!(error instanceof HttpErrorResponse)) return false;
  return error.status === 0 || error.status >= 500;
}

import * as Sentry from '@sentry/node';

/**
 * Inicializa Sentry si hay DSN configurado (§21, observabilidad).
 *
 * Sin `SENTRY_DSN` no hace nada: en desarrollo y en las pruebas no queremos
 * tráfico saliente ni ruido, y la ausencia del DSN es la forma explícita de
 * desactivarlo.
 *
 * Debe llamarse ANTES de crear la aplicación Nest, para que la instrumentación
 * automática alcance a las peticiones desde la primera.
 */
export function initSentry(): boolean {
  const dsn = process.env['SENTRY_DSN'];
  if (!dsn) return false;

  const entorno = process.env['NODE_ENV'] ?? 'development';

  Sentry.init({
    dsn,
    environment: entorno,
    release: process.env['SOURCE_COMMIT'] ?? undefined,

    // Muestreo bajo en producción: interesa el error, no cada traza.
    tracesSampleRate: entorno === 'production' ? 0.1 : 0,

    // Nunca enviar cabeceras ni cuerpos: llevan credenciales y datos
    // personales de técnicos (Ley 29733, §20).
    sendDefaultPii: false,

    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies;
        delete event.request.data;
        if (event.request.headers) {
          delete event.request.headers['authorization'];
          delete event.request.headers['cookie'];
        }
      }
      return event;
    },
  });

  return true;
}

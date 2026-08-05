import * as Sentry from '@sentry/angular';
import { environment } from '../../../environments/environment';

/**
 * Inicializa Sentry en el navegador si hay DSN configurado (§21).
 *
 * Sin DSN no hace nada: en desarrollo no queremos tráfico saliente, y su
 * ausencia es la forma explícita de desactivarlo.
 */
export function initSentry(): boolean {
  if (!environment.sentryDsn) return false;

  Sentry.init({
    dsn: environment.sentryDsn,
    environment: environment.name,

    tracesSampleRate: environment.production ? 0.1 : 0,

    // Nunca capturar el contenido de la pantalla: los informes llevan datos de
    // clientes y fotografías de equipos (§20, Ley 29733).
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    sendDefaultPii: false,

    beforeSend(event) {
      // El access token vive en memoria, pero podría acabar en una URL por error.
      if (event.request?.url) {
        event.request.url = event.request.url.replace(
          /([?&])(token|access_token)=[^&]*/gi,
          '$1$2=***',
        );
      }
      delete event.request?.cookies;
      return event;
    },

    // Ruido del navegador que no es un fallo de la aplicación.
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      'Non-Error promise rejection captured',
    ],
  });

  return true;
}

/** Asocia los errores al usuario de la sesión, sin datos personales de más. */
export function setSentryUser(user: { id: string; rol: string } | null): void {
  if (!environment.sentryDsn) return;
  Sentry.setUser(user ? { id: user.id, segment: user.rol } : null);
}

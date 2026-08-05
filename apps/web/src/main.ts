import { bootstrapApplication } from '@angular/platform-browser';
import { initSentry } from './app/core/observability/sentry';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// Antes de arrancar Angular, para que capture también los fallos de arranque.
initSentry();

bootstrapApplication(App, appConfig).catch((err) => console.error(err));

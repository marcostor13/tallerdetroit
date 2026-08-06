import type { Page } from '@playwright/test';

/**
 * Simula que no hay sesión ni API.
 *
 * Hace falta porque el servidor estático de los E2E devuelve `index.html` para
 * cualquier ruta desconocida —es lo que hace funcionar una SPA con rutas
 * profundas— y eso incluye `/api/v1/...`. Sin esto, `auth/refresh` recibe una
 * página HTML con 200 y la aplicación cree que hay sesión.
 *
 * Antes tampoco era correcto: las peticiones salían a la API desplegada de
 * verdad, y los tests dependían de que estuviera levantada y de qué contestara.
 */
export async function sinBackend(page: Page): Promise<void> {
  await page.route('**/api/v1/**', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/problem+json',
      body: JSON.stringify({
        type: 'about:blank',
        title: 'No autenticado',
        status: 401,
        detail: 'No hay sesión activa.',
      }),
    }),
  );
}

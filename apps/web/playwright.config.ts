import { defineConfig, devices } from '@playwright/test';

/**
 * E2E de los flujos críticos (NFR-11).
 *
 * Se ejecuta contra un build real servido en local, no contra el servidor de
 * desarrollo. Se usa la configuración `development` por un motivo concreto: en
 * ella la API es `/api/v1` relativo, es decir del mismo origen, y eso permite
 * sustituirla con `page.route`. Con la URL absoluta de producción el navegador
 * manda un preflight OPTIONS que Playwright **no puede interceptar** —lo emite
 * la pila de red, no la página—, se va a la API desplegada, el CORS lo rechaza
 * y cualquier POST muere con ERR_FAILED.
 */
export default defineConfig({
  testDir: './e2e',
  // Los tests unitarios usan .spec.ts (Vitest); los e2e se distinguen con .e2e.ts.
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: process.env['E2E_BASE_URL'] ?? 'http://127.0.0.1:4300',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    locale: 'es-PE',
  },

  projects: [
    {
      name: 'escritorio',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      // El requisito es que en móvil se comporte como app: se prueba de verdad.
      name: 'movil',
      use: { ...devices['Pixel 7'] },
    },
  ],

  webServer: process.env['E2E_BASE_URL']
    ? undefined
    : {
        command:
          'npx ng build --configuration development && ' +
          'npx http-server dist/web/browser -p 4300 -a 127.0.0.1 --proxy http://127.0.0.1:4300? -s',
        url: 'http://127.0.0.1:4300',
        reuseExistingServer: !process.env['CI'],
        timeout: 180_000,
      },
});

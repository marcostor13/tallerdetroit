import { defineConfig, devices } from '@playwright/test';

/**
 * E2E de los flujos críticos (NFR-11).
 *
 * Se ejecuta contra el build de producción servido en local: es el artefacto
 * que realmente se despliega, no el servidor de desarrollo.
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
          'npx http-server dist/web/browser -p 4300 -a 127.0.0.1 --proxy http://127.0.0.1:4300? -s',
        url: 'http://127.0.0.1:4300',
        reuseExistingServer: !process.env['CI'],
        timeout: 60_000,
      },
});

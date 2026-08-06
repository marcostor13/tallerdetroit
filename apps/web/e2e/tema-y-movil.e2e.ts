import { expect, test, type Page } from '@playwright/test';
import { sinBackend } from './sin-backend';

/**
 * Requisitos transversales obligatorios de `especificaciones.md`:
 *  · tema claro/oscuro según el navegador y switch en la cabecera
 *  · mobile first, y en móvil la app debe comportarse como app
 */

/**
 * Espera a que el color de fondo converja.
 *
 * El `body` tiene una transición de 200 ms, y `getComputedStyle` durante una
 * transición devuelve el valor INTERPOLADO, no el final: leerlo justo después
 * de pulsar el switch da un color intermedio. `expect.poll` reintenta hasta que
 * el navegador termina de pintar.
 */
async function esperarFondo(page: Page, color: string): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor), {
      timeout: 5000,
    })
    .toBe(color);
}

test.describe('Tema claro / oscuro', () => {
  test.beforeEach(async ({ page }) => {
    await sinBackend(page);
  });

  test('sigue la preferencia oscura del navegador sin destello', async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: 'dark' });
    const page = await context.newPage();
    await sinBackend(page);
    await page.goto('/login');

    // El script inline de index.html resuelve el tema antes del primer pintado.
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'system');
    await esperarFondo(page, 'rgb(19, 19, 19)');

    await context.close();
  });

  test('sigue la preferencia clara del navegador', async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: 'light' });
    const page = await context.newPage();
    await sinBackend(page);
    await page.goto('/login');
    await esperarFondo(page, 'rgb(249, 249, 249)');
    await context.close();
  });

  test('el switch sobrescribe la preferencia y persiste al recargar', async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: 'dark' });
    const page = await context.newPage();
    await sinBackend(page);
    await page.goto('/login');

    await page.getByRole('radio', { name: 'Tema claro' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await esperarFondo(page, 'rgb(249, 249, 249)');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await esperarFondo(page, 'rgb(249, 249, 249)');

    await context.close();
  });

  test('el logotipo cambia según el tema', async ({ browser }) => {
    const dark = await browser.newContext({ colorScheme: 'dark' });
    const pageDark = await dark.newPage();
    // Los contextos nuevos no heredan el stub del `beforeEach`, que se aplica
    // sobre la página del fixture.
    await sinBackend(pageDark);
    await pageDark.goto('/login');
    await expect(pageDark.locator('dps-logo img')).toHaveAttribute('src', /logo-detroit-dark/);
    await dark.close();

    const light = await browser.newContext({ colorScheme: 'light' });
    const pageLight = await light.newPage();
    await sinBackend(pageLight);
    await pageLight.goto('/login');
    await expect(pageLight.locator('dps-logo img')).toHaveAttribute('src', /logo-detroit\.png/);
    await light.close();
  });

  test('el theme-color de la barra del navegador acompaña al tema', async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: 'dark' });
    const page = await context.newPage();
    await sinBackend(page);
    await page.goto('/login');
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#131313');
    await context.close();
  });
});

test.describe('Mobile first', () => {
  test.beforeEach(async ({ page }) => {
    await sinBackend(page);
  });

  test('no hay scroll horizontal a 360 px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/login');

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('los objetivos táctiles miden al menos 44 px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/login');

    const submit = page.getByRole('button', { name: /iniciar sesión/i });
    const box = await submit.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

    const email = page.getByLabel(/correo corporativo/i);
    const emailBox = await email.boundingBox();
    expect(emailBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  });

  test('la PWA declara manifest, iconos maskable y service worker', async ({ page, request }) => {
    await page.goto('/login');
    await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);

    const manifest = await (await request.get('/manifest.webmanifest')).json();
    expect(manifest.display).toBe('standalone');
    expect(manifest.theme_color).toBe('#983128');
    expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);

    expect((await request.get('/ngsw.json')).ok()).toBe(true);
  });

  test('existe un enlace para saltar al contenido', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('.skip-link')).toHaveAttribute('href', '#contenido');
  });
});

import { expect, test } from '@playwright/test';
import { sinBackend } from './sin-backend';

/**
 * Flujo crítico: acceso a la plataforma.
 *
 * Sin sesión, cualquier ruta debe llevar al login conservando el destino, y el
 * formulario debe cumplir los requisitos de accesibilidad de `especificaciones.md`.
 */
test.describe('Login', () => {
  test.beforeEach(async ({ page }) => {
    await sinBackend(page);
  });

  test('redirige al login conservando el destino', async ({ page }) => {
    await page.goto('/inicio');
    await expect(page).toHaveURL(/\/login\?redirectTo=/);
    await expect(page.getByRole('heading', { name: 'Informes técnicos' })).toBeVisible();
  });

  test('cada campo tiene una etiqueta real asociada', async ({ page }) => {
    await page.goto('/login');

    // getByLabel solo encuentra el control si el <label for> está bien enlazado.
    await expect(page.getByLabel(/correo corporativo/i)).toBeVisible();
    await expect(page.getByLabel(/contraseña/i).first()).toBeVisible();

    // El placeholder muestra formato de ejemplo, no la instrucción.
    await expect(page.getByLabel(/correo corporativo/i)).toHaveAttribute('placeholder', /@/);
  });

  test('al enviar vacío marca los campos y explica cómo corregir', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /iniciar sesión/i }).click();

    const email = page.getByLabel(/correo corporativo/i);
    await expect(email).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('alert').first()).toContainText(/escribe/i);

    // El foco va al primer campo con error (UX-07).
    await expect(email).toBeFocused();
  });

  test('valida el formato del correo', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/correo corporativo/i).fill('esto-no-es-un-correo');
    await page.getByRole('button', { name: /iniciar sesión/i }).click();
    await expect(page.getByRole('alert').filter({ hasText: /formato/i })).toBeVisible();
  });

  test('el formulario se recorre solo con teclado', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/correo corporativo/i).focus();
    await page.keyboard.type('tecnico@detroitpower.pe');
    await page.keyboard.press('Tab');
    await page.keyboard.type('contrasenasegura12');

    // Tab llega al botón de mostrar contraseña y luego al de envío.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: /iniciar sesión/i })).toBeFocused();
  });

  test('el botón de mostrar contraseña anuncia su estado', async ({ page }) => {
    await page.goto('/login');
    const toggle = page.getByRole('button', { name: /mostrar contraseña/i });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(page.getByRole('button', { name: /ocultar contraseña/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});

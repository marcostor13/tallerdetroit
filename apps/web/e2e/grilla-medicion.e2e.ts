import { expect, test, type Page } from '@playwright/test';
import { sinBackend } from './sin-backend';

/**
 * El criterio más exigente de F2: **un técnico captura las 11 columnas × 3
 * filas del túnel de bancada usando solo el teclado, en menos de 60 s.**
 *
 * No se puede comprobar con una prueba unitaria: hace falta el recorrido real
 * del foco en un navegador, con el coste de repintar la grilla a cada valor.
 * Aquí el tiempo es del navegador, no del técnico —una persona tarda más en
 * leer el micrómetro que en teclear—, así que lo que mide esta prueba es que la
 * herramienta no sea el cuello de botella.
 *
 * La grilla se monta en una página de prueba propia: el editor de informes
 * todavía no la incorpora (eso es E2.4 en adelante), y lo que se quiere medir
 * es el componente.
 */

/** Los 33 valores del túnel de bancada de un 20V, con uno fuera a propósito. */
const VALORES = Array.from({ length: 33 }, (_, i) =>
  i === 17 ? '171.040' : (171 + (i % 5) * 0.004).toFixed(3),
);

async function abrirGrilla(page: Page): Promise<void> {
  await sinBackend(page);
  await page.goto('/pruebas/grilla');
  await expect(page.getByRole('table')).toBeVisible();
}

test.describe('Grilla de medición', () => {
  test('sale con 11 columnas para un 20V, sin configurar nada', async ({ page }) => {
    await abrirGrilla(page);

    // §12.2: la dimensión se deriva del modelo de motor.
    await expect(page.locator('thead th')).toHaveCount(12); // 11 + la esquina
    await expect(page.locator('input.dps-cell')).toHaveCount(33);
  });

  test('33 valores solo con teclado en menos de 60 s', async ({ page }) => {
    await abrirGrilla(page);

    await page.locator('input.dps-cell').first().focus();

    const inicio = Date.now();
    for (const [i, valor] of VALORES.entries()) {
      await page.keyboard.type(valor);
      // Enter baja una fila. Al terminar las tres de un apoyo se vuelve arriba
      // y se pasa al siguiente: es el recorrido que hace el técnico leyendo el
      // micrómetro apoyo por apoyo.
      if ((i + 1) % 3 === 0) {
        await page.keyboard.press('ArrowUp');
        await page.keyboard.press('ArrowUp');
        await page.keyboard.press('ArrowRight');
      } else {
        await page.keyboard.press('Enter');
      }
    }
    const segundos = (Date.now() - inicio) / 1000;

    console.log(`Captura de 33 valores por teclado: ${segundos.toFixed(1)} s.`);

    await expect(page.getByText('33 / 33')).toBeVisible();
    expect(segundos).toBeLessThan(60);
  });

  test('la ovalidad se calcula sola y no se puede teclear', async ({ page }) => {
    await abrirGrilla(page);

    const primera = page.locator('input.dps-cell').first();
    await primera.focus();
    await page.keyboard.type('171.000');
    await page.keyboard.press('Enter');
    await page.keyboard.type('171.020');

    const ovalidad = page.locator('output.dps-cell--calculated').first();
    await expect(ovalidad).toContainText('0.020');

    // No es alcanzable con Tab: que pareciera un campo invitaría a teclear en
    // ella, y el informe diría una cosa mientras los datos dicen otra.
    await expect(page.locator('output.dps-cell--calculated')).toHaveCount(11);
  });

  test('el semáforo no depende solo del color (WCAG 1.4.1)', async ({ page }) => {
    await abrirGrilla(page);

    const primera = page.locator('input.dps-cell').first();
    await primera.focus();
    await page.keyboard.type('171.040');
    await page.keyboard.press('Tab');

    await expect(primera).toHaveClass(/dps-cell--out/);
    // El informe se imprime y se fotocopia; el color no llega a todo el mundo.
    await expect(primera).toHaveAttribute('aria-label', /fuera de tolerancia/);
    await expect(primera).toHaveAttribute('aria-invalid', 'true');
  });

  test('pegar un rango desde Excel lo reparte por las celdas', async ({ page }) => {
    await abrirGrilla(page);

    const primera = page.locator('input.dps-cell').first();
    await primera.focus();

    // Se simula el portapapeles: es lo que produce copiar tres celdas de una
    // fila de Excel.
    await primera.evaluate((el) => {
      const datos = new DataTransfer();
      datos.setData('text/plain', '171.001\t171.002\t171.003');
      el.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: datos, bubbles: true, cancelable: true }),
      );
    });

    await expect(page.locator('input.dps-cell').nth(0)).toHaveValue('171.001');
    await expect(page.locator('input.dps-cell').nth(1)).toHaveValue('171.002');
    await expect(page.locator('input.dps-cell').nth(2)).toHaveValue('171.003');
  });
});

test.describe('Grilla a 360 px (T3)', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test('la grilla se desplaza por dentro, sin arrastrar la página', async ({ page }) => {
    await abrirGrilla(page);

    // Once columnas no caben en un teléfono de ninguna manera. Lo que no puede
    // pasar es que el documento entero se desplace en dos ejes.
    const desbordaPagina = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(desbordaPagina).toBe(false);

    const scrollInterno = await page
      .locator('div.overflow-auto')
      .first()
      .evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(scrollInterno).toBe(true);
  });

  test('las cabeceras se quedan fijas al desplazar', async ({ page }) => {
    await abrirGrilla(page);

    const posicion = await page
      .locator('thead th')
      .nth(1)
      .evaluate((el) => getComputedStyle(el).position);
    expect(posicion).toBe('sticky');

    const filaFija = await page
      .locator('th[scope="row"]')
      .first()
      .evaluate((el) => getComputedStyle(el).position);
    expect(filaFija).toBe('sticky');
  });

  test('la celda es alcanzable con el dedo', async ({ page }) => {
    await abrirGrilla(page);

    const caja = await page.locator('input.dps-cell').first().boundingBox();
    // §7.3: 88 × 36. Es más estrecha que los 44 px de un botón a propósito —en
    // una matriz de once columnas no cabría—, pero la fila entera sí llega.
    expect(caja?.width).toBeGreaterThanOrEqual(88);
    expect(caja?.height).toBeGreaterThanOrEqual(36);
  });
});

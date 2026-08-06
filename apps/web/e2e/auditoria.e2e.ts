import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * Consulta de auditoría (F3, E3.8).
 *
 * El criterio dice: **filtra por actor, entidad, acción y rango de fechas**. Lo
 * que se comprueba aquí es que los filtros lleguen de verdad a la petición —no
 * que la pantalla los pinte— y que la tabla se pueda leer también en un
 * teléfono, donde seis columnas no caben.
 */

const ADMIN = {
  id: 'u9',
  email: 'admin@detroitpower.pe',
  nombre: 'ADMINISTRADOR',
  rol: 'administrador',
  permisos: ['audit:read', 'reports:read', 'masters:read', 'templates:read', 'users:read'],
  unidadNegocioId: null,
  tecnicoId: null,
  mfaHabilitado: false,
};

const REGISTROS = [
  {
    _id: 'a1',
    actorEmail: 'jsalazar@detroitpower.pe',
    actorRol: 'supervisor',
    entidad: 'reports',
    entidadId: 'r1',
    accion: 'emitir',
    etiqueta: 'ITS-T-E-26-003-0898',
    antes: { estado: 'aprobado' },
    despues: { estado: 'emitido' },
    ip: '190.12.44.7',
    userAgent: 'Mozilla/5.0',
    fecha: '2026-08-06T15:04:00.000Z',
  },
  {
    _id: 'a2',
    actorEmail: 'rcaceres@detroitpower.pe',
    actorRol: 'tecnico',
    entidad: 'reports',
    entidadId: 'r1',
    accion: 'crear',
    etiqueta: 'ITS-T-E-26-003-0898',
    antes: null,
    despues: { numeroInforme: 'ITS-T-E-26-003-0898' },
    ip: '190.12.44.9',
    userAgent: 'Mozilla/5.0',
    fecha: '2026-08-05T09:12:00.000Z',
  },
];

/** Guarda la última consulta para poder comprobar qué se pidió. */
let ultimaConsulta: URLSearchParams | null = null;

async function conApiSimulada(page: Page): Promise<void> {
  ultimaConsulta = null;

  const json = (route: Route, body: unknown, status = 200) => {
    const origen = route.request().headers()['origin'] ?? '*';
    return route.fulfill({
      status,
      contentType: 'application/json',
      headers: {
        'access-control-allow-origin': origen,
        'access-control-allow-credentials': 'true',
        'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
        'access-control-allow-headers': 'authorization,content-type',
      },
      body: JSON.stringify(body),
    });
  };

  const responder = (manejador: (route: Route) => unknown) => (route: Route) =>
    route.request().method() === 'OPTIONS' ? json(route, {}, 204) : manejador(route);

  await page.route(
    '**/api/v1/auth/refresh',
    responder((r) => json(r, { accessToken: 'tok', user: ADMIN })),
  );

  await page.route(
    '**/api/v1/audit**',
    responder((route) => {
      const url = new URL(route.request().url());
      ultimaConsulta = url.searchParams;

      // La simulación filtra de verdad: una que devuelve siempre lo mismo no
      // probaría que los filtros lleguen a ninguna parte.
      const accion = url.searchParams.get('accion');
      const items = accion ? REGISTROS.filter((r) => r.accion === accion) : REGISTROS;

      return json(route, { total: items.length, items });
    }),
  );
}

const irAAuditoria = async (page: Page) => {
  await conApiSimulada(page);
  await page.goto('/auditoria');
  await expect(page.getByRole('heading', { name: 'Auditoría', level: 1 })).toBeVisible();
};

test.describe('Consulta de auditoría (E3.8)', () => {
  test('al entrar muestra lo más reciente primero', async ({ page }) => {
    await irAAuditoria(page);

    await expect(page.getByText('2 registro(s)')).toBeVisible();

    const filas = page.locator('tbody tr');
    await expect(filas).toHaveCount(2);
    // El orden lo da el servidor; la pantalla no lo reordena.
    await expect(filas.first()).toContainText('jsalazar@detroitpower.pe');
  });

  test('el filtro de acción llega a la petición y recorta el resultado', async ({ page }) => {
    await irAAuditoria(page);

    await page.getByLabel('Acción').selectOption('emitir');
    await page.getByRole('button', { name: /buscar/i }).click();

    await expect(page.locator('tbody tr')).toHaveCount(1);
    expect(ultimaConsulta?.get('accion')).toBe('emitir');
  });

  test('entidad y rango de fechas viajan juntos', async ({ page }) => {
    await irAAuditoria(page);

    await page.getByLabel('Entidad').selectOption('reports');
    await page.getByLabel('Desde').fill('2026-08-01');
    await page.getByLabel('Hasta').fill('2026-08-06');
    await page.getByRole('button', { name: /buscar/i }).click();

    await expect(page.getByText('2 registro(s)')).toBeVisible();
    expect(ultimaConsulta?.get('entidad')).toBe('reports');
    expect(ultimaConsulta?.get('desde')).toBe('2026-08-01');
    expect(ultimaConsulta?.get('hasta')).toBe('2026-08-06');
  });

  test('limpiar quita los filtros de la petición, no solo de la pantalla', async ({ page }) => {
    await irAAuditoria(page);

    await page.getByLabel('Acción').selectOption('emitir');
    await page.getByRole('button', { name: /buscar/i }).click();
    await expect(page.locator('tbody tr')).toHaveCount(1);

    await page.getByRole('button', { name: /limpiar/i }).click();

    await expect(page.locator('tbody tr')).toHaveCount(2);
    expect(ultimaConsulta?.get('accion')).toBeNull();
  });

  test('el resultado se anuncia por lector de pantalla (T2)', async ({ page }) => {
    await irAAuditoria(page);

    const contador = page.locator('[role="status"]', { hasText: /registro\(s\)/ });
    await expect(contador).toHaveAttribute('aria-live', 'polite');
  });

  test('la acción se lee en palabras, no por su clave interna', async ({ page }) => {
    await irAAuditoria(page);

    // «emitir» es la clave del log; en pantalla se lee «Emitió».
    await expect(page.locator('tbody')).toContainText('Emitió');
    await expect(page.locator('tbody')).toContainText('Creó');
  });
});

test.describe('Auditoría a 360 px (T3)', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test('en móvil se lee como lista de tarjetas, sin scroll horizontal', async ({ page }) => {
    await irAAuditoria(page);

    // La tabla de seis columnas se oculta y quedan las tarjetas.
    await expect(page.locator('table')).toBeHidden();
    await expect(page.getByRole('listitem')).toHaveCount(2);

    const desborda = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(desborda).toBe(false);
  });
});

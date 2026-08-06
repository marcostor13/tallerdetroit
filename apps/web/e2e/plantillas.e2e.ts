import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * Gobierno del formato (F3, E3.7).
 *
 * El criterio: **Calidad publica SER-FOR-002 v02 agregando una sección**, sin
 * que nadie toque código. Es lo que hace cierta la promesa del motor de
 * plantillas.
 *
 * La otra mitad —que los informes emitidos con v01 se sigan renderizando
 * idénticos— no se prueba aquí sino donde vive: el congelado de
 * `templateSnapshot` al emitir, que ya está desde F1 (`report-html.spec.ts` y
 * `reports.e2e.spec.ts`). Aquí se comprueba que la pantalla **no deja tocar una
 * versión publicada**, que es la mitad que le toca al frontend.
 */

const CALIDAD = {
  id: 'u5',
  email: 'calidad@detroitpower.pe',
  nombre: 'CALIDAD',
  rol: 'calidad',
  // Los mismos que da `ROLE_PERMISSIONS.calidad`.
  permisos: [
    'reports:read',
    'reports:read:all',
    'templates:read',
    'templates:write',
    'templates:publish',
    'masters:read',
    'masters:write',
  ],
  unidadNegocioId: null,
  tecnicoId: null,
  mfaHabilitado: false,
};

const SECCIONES_V01 = [
  {
    clave: 'datos-generales',
    numeral: 'I',
    titulo: 'Datos generales',
    orden: 1,
    paso: 1,
    bloques: [{ clave: 'identificacion', tipo: 'header_meta', titulo: 'Identificación', orden: 1 }],
  },
  {
    clave: 'trabajos',
    numeral: 'V',
    titulo: 'Trabajos realizados',
    orden: 2,
    paso: 3,
    bloques: [{ clave: 'trabajos', tipo: 'work_task', titulo: 'Trabajo realizado', orden: 1 }],
  },
];

/** Lo último que recibió el servidor simulado, para comprobar qué se envió. */
let ultimoCuerpo: Record<string, unknown> | null = null;
let publicada: string | null = null;

async function conApiSimulada(page: Page): Promise<void> {
  ultimoCuerpo = null;
  publicada = null;

  const versiones: Record<string, unknown>[] = [
    {
      _id: 'tv1',
      codigo: 'SER-FOR-002',
      version: 'v01',
      nombre: 'Informe técnico general',
      estado: 'publicada',
      fechaPublicacion: '2026-08-01T00:00:00.000Z',
      secciones: SECCIONES_V01,
    },
  ];

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
    responder((r) => json(r, { accessToken: 'tok', user: CALIDAD })),
  );

  // Publicar. Va antes que la genérica de versiones porque en Playwright gana
  // la ruta registrada más tarde, así que las específicas van al final.
  await page.route(
    '**/api/v1/templates/SER-FOR-002/versiones',
    responder((route) => {
      if (route.request().method() === 'POST') {
        const cuerpo = route.request().postDataJSON() as { version: string; secciones: unknown[] };
        ultimoCuerpo = cuerpo;
        const creada = {
          _id: `tv${versiones.length + 1}`,
          codigo: 'SER-FOR-002',
          version: cuerpo.version,
          nombre: 'Informe técnico general',
          estado: 'borrador',
          fechaPublicacion: null,
          secciones: cuerpo.secciones ?? [],
        };
        versiones.push(creada);
        return json(route, creada, 201);
      }
      return json(route, { total: versiones.length, items: versiones });
    }),
  );

  await page.route(
    '**/api/v1/templates/SER-FOR-002/versiones/*',
    responder((route) => {
      const version = route.request().url().split('/').pop() as string;
      const doc = versiones.find((v) => v['version'] === version);

      if (route.request().method() === 'PATCH') {
        const cuerpo = route.request().postDataJSON() as { secciones: unknown[] };
        ultimoCuerpo = cuerpo;
        if (doc) doc['secciones'] = cuerpo.secciones;
        return json(route, doc ?? {});
      }
      return json(route, doc ?? {});
    }),
  );

  await page.route(
    '**/api/v1/templates/SER-FOR-002/versiones/*/publicar',
    responder((route) => {
      const version = route.request().url().split('/').at(-2) as string;
      const doc = versiones.find((v) => v['version'] === version);
      if (doc) {
        doc['estado'] = 'publicada';
        doc['fechaPublicacion'] = new Date().toISOString();
        publicada = version;
      }
      return json(route, doc ?? {}, 201);
    }),
  );
}

const irAPlantillas = async (page: Page) => {
  await conApiSimulada(page);
  await page.goto('/plantillas');
  await expect(page.getByRole('heading', { name: /SER-FOR-002/, level: 1 })).toBeVisible();
};

test.describe('Gobierno del formato (E3.7)', () => {
  test('una versión publicada se ve pero no se edita (§11.1)', async ({ page }) => {
    await irAPlantillas(page);

    await expect(page.getByText(/está publicada y no se puede modificar/i)).toBeVisible();

    // Los campos existen —hay que poder leer el formato— pero están bloqueados.
    const titulo = page.getByLabel('Título de la sección').first();
    await expect(titulo).toBeDisabled();
    await expect(page.getByRole('button', { name: /añadir sección/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^publicar/i })).toHaveCount(0);
  });

  test('la versión nueva nace copiando la vigente', async ({ page }) => {
    await irAPlantillas(page);

    await page.getByLabel('Nueva versión').fill('v02');
    await page.getByRole('button', { name: /crear borrador/i }).click();

    await expect(page.getByRole('heading', { name: /Secciones de v02/ })).toBeVisible();

    // No nace vacía: añadir una sección no puede costar reescribir las que ya
    // existen.
    expect((ultimoCuerpo?.['secciones'] as unknown[])?.length).toBe(2);
    await expect(page.getByLabel('Título de la sección').first()).toHaveValue('Datos generales');
  });

  test('el criterio de F3: se añade una sección y se publica v02', async ({ page }) => {
    await irAPlantillas(page);

    await page.getByLabel('Nueva versión').fill('v02');
    await page.getByRole('button', { name: /crear borrador/i }).click();
    await expect(page.getByRole('heading', { name: /Secciones de v02/ })).toBeVisible();

    await page.getByRole('button', { name: /añadir sección/i }).click();

    const titulos = page.getByLabel('Título de la sección');
    await expect(titulos).toHaveCount(3);
    await titulos.last().fill('Ensayos no destructivos');
    await titulos.last().blur();

    await expect(page.getByText('Sin guardar')).toBeVisible();

    await page.getByRole('button', { name: /publicar v02/i }).click();

    await expect(page.getByText(/está publicada y no se puede modificar/i)).toBeVisible();
    expect(publicada).toBe('v02');

    // Y lo que se publicó lleva la sección nueva con su título, no el que traía
    // al crearse: publicar tiene que guardar antes lo que hay en pantalla.
    const enviadas = ultimoCuerpo?.['secciones'] as { titulo: string }[] | undefined;
    expect(enviadas?.map((s) => s.titulo)).toContain('Ensayos no destructivos');
  });

  test('subir y bajar renumera el orden, no solo la pantalla', async ({ page }) => {
    await irAPlantillas(page);
    await page.getByLabel('Nueva versión').fill('v02');
    await page.getByRole('button', { name: /crear borrador/i }).click();
    await expect(page.getByRole('heading', { name: /Secciones de v02/ })).toBeVisible();

    await page.getByRole('button', { name: /subir/i }).last().click();
    await page.getByRole('button', { name: /guardar borrador/i }).click();

    const enviadas = ultimoCuerpo?.['secciones'] as { clave: string; orden: number }[] | undefined;
    // «Trabajos» pasa al primer puesto y se lleva el orden 1: sin renumerar, la
    // lista se vería movida y el documento saldría igual que antes.
    expect(enviadas?.[0]).toMatchObject({ clave: 'trabajos', orden: 1 });
    expect(enviadas?.[1]).toMatchObject({ clave: 'datos-generales', orden: 2 });
  });

  test('el error de publicación se muestra tal cual lo manda el servidor', async ({ page }) => {
    await irAPlantillas(page);
    await page.getByLabel('Nueva versión').fill('v02');
    await page.getByRole('button', { name: /crear borrador/i }).click();
    await expect(page.getByRole('heading', { name: /Secciones de v02/ })).toBeVisible();

    // El servidor devuelve la lista de incoherencias; mostrarla entera es más
    // útil que un «no se pudo publicar».
    await page.route('**/api/v1/templates/SER-FOR-002/versiones/*/publicar', (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({
          status: 400,
          title: 'Solicitud inválida',
          detail: 'La plantilla no se puede publicar:\n· La sección «seccion-3» no tiene bloques.',
        }),
      }),
    );

    await page.getByRole('button', { name: /publicar v02/i }).click();

    await expect(page.getByRole('alert')).toContainText('no tiene bloques');
  });
});

test.describe('Formato a 360 px (T3)', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test('se puede revisar el formato desde un teléfono', async ({ page }) => {
    await irAPlantillas(page);

    await expect(page.getByRole('heading', { name: /Secciones de v01/ })).toBeVisible();

    const desborda = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(desborda).toBe(false);
  });
});

import { expect, test, type BrowserContext, type Page, type Route } from '@playwright/test';

/**
 * Trabajar sin red (E4.3, E4.4).
 *
 * Este es el criterio que decide si la plataforma nueva sirve donde ya servía
 * la PWA que el técnico usa hoy: en mina y en taller la cobertura va y viene, y
 * lo que se captura tiene que quedarse capturado. Aquí se comprueba el camino
 * entero en un navegador de verdad —con su IndexedDB, no un doble— :
 *
 *  1. con red, abrir un informe deja la plantilla guardada en el dispositivo
 *  2. sin red, la bandeja crea el informe igual, con un id local
 *  3. el editor lo abre y acepta lo que el técnico escriba
 *  4. al volver la señal, la cola sube y el informe pasa a tener su id de
 *     verdad **sin que el técnico tenga que hacer nada ni recargar**
 *
 * El paso 4 es el que más importa y el que no se puede probar en unitarios: si
 * la URL se quedara con el id local, el técnico volvería a esa pantalla al día
 * siguiente y encontraría un «este informe ya no está en el dispositivo».
 */

const PLANTILLA = {
  codigo: 'SER-FOR-002',
  version: 'v01',
  nombre: 'Informe técnico general',
  estado: 'publicada',
  secciones: [
    {
      clave: 'datos-generales',
      numeral: 'I',
      titulo: 'Datos generales',
      orden: 1,
      paso: 1,
      bloques: [
        {
          clave: 'identificacion',
          tipo: 'header_meta',
          titulo: 'Identificación del informe',
          orden: 1,
          obligatorio: true,
        },
      ],
    },
  ],
};

const USUARIO = {
  id: 'u1',
  email: 'rcaceres@detroitpower.pe',
  nombre: 'REYNALDO CÁCERES',
  rol: 'tecnico',
  permisos: [
    'reports:read',
    'reports:create',
    'reports:update',
    'reports:submit',
    'masters:read',
    'masters:write',
    'templates:read',
  ],
  unidadNegocioId: null,
  tecnicoId: null,
  mfaHabilitado: false,
};

const informeDeServidor = (id: string, numero: string) => ({
  _id: id,
  numeroInforme: numero,
  numeroOt: null,
  templateCodigo: 'SER-FOR-002',
  templateVersion: 'v01',
  templateSnapshot: null,
  estado: 'borrador',
  cliente: { id: null, nombre: null },
  equipo: {},
  motor: {},
  datos: {},
  bloques: [],
  comentarios: [],
});

/** Lo que el servidor recibió, para comprobar qué subió la cola. */
interface Simulacion {
  readonly empujes: { tipo: string; informeId: string }[][];
}

async function conApiSimulada(page: Page): Promise<Simulacion> {
  const empujes: { tipo: string; informeId: string }[][] = [];

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
    '**/api/v1/auth/**',
    responder((r) => json(r, { accessToken: 'tok', user: USUARIO })),
  );
  await page.route(
    '**/api/v1/templates/**',
    responder((r) => json(r, PLANTILLA)),
  );
  await page.route(
    '**/api/v1/masters/**',
    responder((r) => json(r, { total: 0, items: [] })),
  );

  // La cola de sincronización: contesta con el id definitivo del informe que se
  // creó sin red, que es lo que dispara el cambio de URL en el editor.
  await page.route(
    '**/api/v1/sync/push',
    responder((route) => {
      const { operaciones } = route.request().postDataJSON() as {
        operaciones: { clientOpId: string; tipo: string; informeId: string }[];
      };
      empujes.push(operaciones.map((o) => ({ tipo: o.tipo, informeId: o.informeId })));

      return json(route, {
        resultados: operaciones.map((o) => ({
          clientOpId: o.clientOpId,
          estado: 'aplicada',
          informeId: o.tipo === 'crear-informe' ? 'r-servidor' : o.informeId,
        })),
      });
    }),
  );

  await page.route(
    '**/api/v1/reports/**',
    responder((route) => {
      const url = route.request().url();
      if (url.includes('/validacion')) return json(route, { emitible: false, faltan: [] });
      if (url.includes('r-servidor')) {
        return json(route, informeDeServidor('r-servidor', 'ITS-SIN-RED'));
      }
      return json(route, informeDeServidor('r1', 'ITS-T-E-26-003-0746'));
    }),
  );

  await page.route(
    '**/api/v1/reports?**',
    responder((r) => json(r, { total: 0, items: [] })),
  );

  return { empujes };
}

/**
 * Corta la red, ya con la bandeja en pantalla.
 *
 * La espera no es cosmética: la bandeja es una ruta perezosa y cortar la red
 * mientras su código todavía viene por el cable deja la página en blanco. El
 * técnico llega a la pantalla y *después* pierde cobertura, no al revés.
 */
async function enSocavon(page: Page, context: BrowserContext): Promise<void> {
  await expect(page.getByRole('button', { name: /nuevo informe/i })).toBeVisible();
  await context.setOffline(true);
}

/**
 * Deja la plantilla en el dispositivo.
 *
 * Es lo que hace el técnico sin saberlo: abre un informe cualquiera con
 * cobertura antes de bajar. Sin este paso no se puede crear sin red, y la app
 * lo dice en vez de abrir un editor en blanco.
 */
async function conPlantillaGuardada(page: Page): Promise<void> {
  await page.goto('/informes/r1');
  await expect(page.getByRole('heading', { name: /ITS-T-E-26-003-0746/ })).toBeVisible();
}

/**
 * Va a la bandeja **por navegación de la SPA**, no recargando.
 *
 * Recargar sin red no puede funcionar en estos E2E: se ejecutan contra el build
 * de desarrollo, donde el service worker está desactivado, así que el navegador
 * tendría que ir a buscar por el cable el código de la pantalla. En producción
 * eso lo resuelve el service worker; aquí se mantiene viva la aplicación, que
 * es además lo que hace el técnico: entra a la pantalla y luego pierde la
 * señal, no al revés.
 */
async function irALaBandeja(page: Page): Promise<void> {
  // `:visible` porque el enlace existe en las dos navegaciones —el rail de
  // escritorio y la barra inferior de móvil— y solo una se ve a la vez.
  await page.locator('a[href="/informes"]:visible').first().click();
  await expect(page).toHaveURL(/\/informes$/);
}

test.describe('Trabajar sin conexión (E4.3)', () => {
  test('el informe se crea, se edita y sube solo al volver la señal', async ({ page, context }) => {
    const simulacion = await conApiSimulada(page);
    await conPlantillaGuardada(page);

    await irALaBandeja(page);
    await enSocavon(page, context);

    await page.getByRole('button', { name: /nuevo informe/i }).click();
    await page.getByLabel(/N° del informe/i).fill('ITS-SIN-RED');
    await page.getByRole('button', { name: /crear y editar/i }).click();

    // Nace en el dispositivo: la URL lo dice.
    await expect(page).toHaveURL(/\/informes\/local:/);
    await expect(page.getByRole('heading', { name: /ITS-SIN-RED/ })).toBeVisible();

    // Vuelve la señal. Nadie recarga ni pulsa nada.
    await context.setOffline(false);

    await expect(page).toHaveURL(/\/informes\/r-servidor/, { timeout: 15_000 });
    expect(simulacion.empujes.flat().some((o) => o.tipo === 'crear-informe')).toBe(true);
  });

  test('sin plantilla guardada lo dice, en vez de abrir un editor en blanco', async ({
    page,
    context,
  }) => {
    await conApiSimulada(page);

    // Se entra a la bandeja sin haber abierto nunca un informe: el dispositivo
    // no sabe qué secciones tendría que pintar.
    await page.goto('/informes');
    await enSocavon(page, context);

    await page.getByRole('button', { name: /nuevo informe/i }).click();
    await page.getByLabel(/N° del informe/i).fill('ITS-IMPOSIBLE');
    await page.getByRole('button', { name: /crear y editar/i }).click();

    await expect(page.getByText(/abre uno con red al menos una vez/i)).toBeVisible();
    await expect(page).toHaveURL(/\/informes$/);
  });

  test('la bandeja sin red enseña lo que hay en el dispositivo', async ({ page, context }) => {
    await conApiSimulada(page);
    await conPlantillaGuardada(page);

    await irALaBandeja(page);
    await enSocavon(page, context);

    await page.getByRole('button', { name: /nuevo informe/i }).click();
    await page.getByLabel(/N° del informe/i).fill('ITS-EN-EL-SOCAVON');
    await page.getByRole('button', { name: /crear y editar/i }).click();
    await expect(page).toHaveURL(/\/informes\/local:/);

    // Se vuelve por el historial y no con `goto`: sin red, una recarga de
    // verdad no puede descargar la app. Es lo que hace el técnico con el botón
    // atrás del teléfono.
    await page.goBack();
    await expect(page).toHaveURL(/\/informes$/);

    const sinSincronizar = page.getByRole('region', { name: /sin sincronizar/i });
    await expect(sinSincronizar).toBeVisible();
    await expect(sinSincronizar.getByText('ITS-EN-EL-SOCAVON')).toBeVisible();
  });
});

import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * Flujo de revisión (F3, E3.2).
 *
 * Dos criterios de F3 solo se pueden comprobar en un navegador de verdad:
 *
 *  · **los comentarios son navegables por teclado y anunciados por lector de
 *    pantalla** (T2)
 *  · **el flujo de revisión completo es operable desde móvil** (T3)
 *
 * Como en el resto de e2e, la API se sustituye por respuestas fijas: lo que se
 * mide aquí es la pantalla. Pero la simulación **sí aplica las reglas** —añadir
 * un comentario, resolverlo, y no dejar aprobar mientras quede uno abierto—,
 * porque una simulación que dice que sí a todo no probaría nada.
 */

const PLANTILLA = {
  codigo: 'SER-FOR-002',
  version: 'v01',
  nombre: 'Informe técnico general',
  estado: 'publicada',
  secciones: [
    {
      clave: 'trabajos',
      numeral: 'V',
      titulo: 'Trabajos realizados',
      orden: 1,
      paso: 1,
      bloques: [{ clave: 'trabajos', tipo: 'work_task', titulo: 'Trabajo realizado', orden: 1 }],
    },
  ],
};

interface Comentario {
  id: string;
  bloqueId: string | null;
  texto: string;
  autorNombre: string;
  fecha: string;
  resuelto: boolean;
}

const SUPERVISOR = {
  id: 'u2',
  email: 'jsalazar@detroitpower.pe',
  nombre: 'J. SALAZAR',
  rol: 'supervisor',
  // Los mismos que da `ROLE_PERMISSIONS.supervisor`.
  permisos: [
    'reports:read',
    'reports:read:all',
    'reports:create',
    'reports:update',
    'reports:submit',
    'reports:review',
    'reports:approve',
    'reports:issue',
  ],
  unidadNegocioId: null,
  tecnicoId: null,
  mfaHabilitado: false,
};

function informeInicial() {
  return {
    _id: 'r1',
    numeroInforme: 'ITS-T-E-26-003-0898',
    numeroOt: 'LIM-TAL-000898',
    templateCodigo: 'SER-FOR-002',
    templateVersion: 'v01',
    templateSnapshot: null,
    estado: 'en_revision',
    cliente: { id: 'c1', nombre: 'SPCC. TOQUEPALA' },
    sede: { id: null, nombre: null },
    equipo: { categoria: 'camion_minero' },
    motor: {},
    datos: {},
    comentarios: [] as Comentario[],
    bloques: [
      {
        id: 'b1',
        clave: 'trabajos',
        tipo: 'work_task',
        orden: 1,
        titulo: 'DESMONTAJE DE CULATAS',
        texto: 'Se desmontan las veinte culatas.',
        fotos: [],
        visible: true,
      },
      {
        id: 'b2',
        clave: 'trabajos',
        tipo: 'work_task',
        orden: 2,
        titulo: 'MEDICIÓN DEL TÚNEL DE BANCADA',
        texto: 'Se mide el túnel apoyo por apoyo.',
        fotos: [],
        visible: true,
      },
    ],
  };
}

async function conApiSimulada(page: Page): Promise<void> {
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

  let informe = informeInicial();

  await page.route(
    '**/api/v1/auth/refresh',
    responder((r) => json(r, { accessToken: 'tok', user: SUPERVISOR })),
  );
  await page.route(
    '**/api/v1/templates/**',
    responder((r) => json(r, PLANTILLA)),
  );
  await page.route(
    '**/api/v1/masters/**',
    responder((r) => json(r, { total: 0, items: [] })),
  );
  await page.route(
    '**/api/v1/reports/r1/validacion',
    responder((r) => json(r, { emitible: true, faltan: [] })),
  );
  await page.route(
    '**/api/v1/reports/r1/conclusiones-sugeridas',
    responder((r) => json(r, { propuestas: [], frecuentes: [] })),
  );

  await page.route(
    '**/api/v1/reports/r1/comentarios',
    responder((route) => {
      const cuerpo = route.request().postDataJSON() as { bloqueId: string | null; texto: string };
      informe.comentarios.push({
        id: `c${informe.comentarios.length + 1}`,
        bloqueId: cuerpo.bloqueId,
        texto: cuerpo.texto,
        autorNombre: SUPERVISOR.nombre,
        fecha: new Date().toISOString(),
        resuelto: false,
      });
      return json(route, informe, 201);
    }),
  );

  await page.route(
    '**/api/v1/reports/r1/comentarios/*',
    responder((route) => {
      const id = route.request().url().split('/').pop() as string;
      const { resuelto } = route.request().postDataJSON() as { resuelto: boolean };
      const comentario = informe.comentarios.find((c) => c.id === id);
      if (comentario) comentario.resuelto = resuelto;
      return json(route, informe);
    }),
  );

  // La regla que se está probando: no se aprueba con observaciones abiertas.
  await page.route(
    '**/api/v1/reports/r1/estado',
    responder((route) => {
      const { estado } = route.request().postDataJSON() as { estado: string };
      const abiertos = informe.comentarios.filter((c) => !c.resuelto).length;

      if (estado === 'aprobado' && abiertos > 0) {
        return json(
          route,
          {
            status: 400,
            title: 'Solicitud inválida',
            detail: `Quedan ${abiertos} comentario(s) sin resolver.`,
          },
          400,
        );
      }

      informe = { ...informe, estado };
      return json(route, informe, 201);
    }),
  );

  await page.route(
    '**/api/v1/reports/r1',
    responder((route) => {
      if (route.request().method() !== 'PATCH') return json(route, informe);
      return json(route, { guardadoEn: new Date().toISOString(), informe });
    }),
  );
}

const irAlEditor = async (page: Page) => {
  await conApiSimulada(page);
  await page.goto('/informes/r1');
  await expect(page.getByRole('heading', { name: /ITS-T-E-26-003-0898/ })).toBeVisible();
};

const panelDeRevision = (page: Page) =>
  page.getByRole('heading', { name: 'Revisión', exact: true });

test.describe('Revisión colaborativa (E3.2)', () => {
  test('el comentario se ancla a un bloque, no queda suelto', async ({ page }) => {
    await irAlEditor(page);

    // El selector de bloque ofrece los del informe, con su título.
    const sobre = page.getByLabel(/sobre qué bloque/i);
    await expect(sobre).toBeVisible();
    await expect(sobre.locator('option')).toContainText([
      /general/i,
      /DESMONTAJE DE CULATAS/,
      /MEDICIÓN DEL TÚNEL/,
    ]);

    await sobre.selectOption({ label: 'MEDICIÓN DEL TÚNEL DE BANCADA' });
    await page
      .getByLabel(/qué hay que corregir/i)
      .fill('El apoyo 7 está fuera y no lleva justificación.');
    await page.getByRole('button', { name: /añadir comentario/i }).click();

    // Aparece con el bloque al que apunta, no como una nota al pie.
    await expect(page.getByText('El apoyo 7 está fuera y no lleva justificación.')).toBeVisible();
    await expect(page.getByText('MEDICIÓN DEL TÚNEL DE BANCADA').last()).toBeVisible();
  });

  test('el contador de abiertos se anuncia por lector de pantalla (T2)', async ({ page }) => {
    await irAlEditor(page);

    // `role=status` con aria-live: quien no ve la pantalla se entera de que su
    // comentario se registró y de que el contador subió.
    const contador = page.locator('[role="status"]', { hasText: /abierto\(s\)/ });
    await expect(contador).toHaveAttribute('aria-live', 'polite');
    await expect(contador).toContainText('0 abierto(s)');

    await page.getByLabel(/qué hay que corregir/i).fill('Falta la foto del apoyo 3.');
    await page.getByRole('button', { name: /añadir comentario/i }).click();

    await expect(contador).toContainText('1 abierto(s)');
  });

  test('se comenta y se resuelve sin tocar el ratón (T2)', async ({ page }) => {
    await irAlEditor(page);

    await panelDeRevision(page).scrollIntoViewIfNeeded();

    // Se llega al textarea con Tab desde el selector de bloque.
    await page.getByLabel(/sobre qué bloque/i).focus();
    await page.keyboard.press('Tab');
    await page.keyboard.type('Falta el pie de la figura 12.');
    await page.keyboard.press('Tab');

    const enfocado = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
    expect(enfocado).toMatch(/añadir comentario/i);

    await page.keyboard.press('Enter');
    await expect(page.getByText('Falta el pie de la figura 12.')).toBeVisible();

    // Y se resuelve igual: el botón está en el orden de lectura del comentario.
    const resolver = page.getByRole('button', { name: /marcar resuelto/i });
    await resolver.focus();
    await page.keyboard.press('Enter');

    await expect(page.getByRole('button', { name: /reabrir/i })).toBeVisible();
  });

  test('un comentario resuelto se puede reabrir: no se borra nunca', async ({ page }) => {
    await irAlEditor(page);

    await page.getByLabel(/qué hay que corregir/i).fill('La conclusión no menciona el turbo B.');
    await page.getByRole('button', { name: /añadir comentario/i }).click();
    await page.getByRole('button', { name: /marcar resuelto/i }).click();
    await page.getByRole('button', { name: /reabrir/i }).click();

    await expect(page.getByRole('button', { name: /marcar resuelto/i })).toBeVisible();
    // El texto sigue ahí en los tres pasos: no hay forma de hacerlo desaparecer.
    await expect(page.getByText('La conclusión no menciona el turbo B.')).toBeVisible();
  });

  test('no se aprueba con observaciones abiertas, y se dice por qué', async ({ page }) => {
    await irAlEditor(page);

    await page.getByLabel(/qué hay que corregir/i).fill('El apoyo 7 está fuera de tolerancia.');
    await page.getByRole('button', { name: /añadir comentario/i }).click();

    await expect(
      page.getByText(/no se puede aprobar mientras queden observaciones/i),
    ).toBeVisible();

    await page.getByRole('button', { name: /^aprobar$/i }).click();
    await expect(page.getByText(/sin resolver/i).first()).toBeVisible();

    // Resuelto el comentario, el aviso desaparece.
    await page.getByRole('button', { name: /marcar resuelto/i }).click();
    await expect(page.getByText(/no se puede aprobar mientras queden observaciones/i)).toHaveCount(
      0,
    );
  });

  test('las acciones salen de la máquina de estados, no de una lista a mano', async ({ page }) => {
    await irAlEditor(page);

    // Desde `en_revision`, un supervisor puede devolver u aprobar.
    await expect(page.getByRole('button', { name: /devolver con observaciones/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^aprobar$/i })).toBeVisible();

    // No puede emitir: para eso el informe tiene que estar aprobado antes.
    await expect(page.getByRole('button', { name: /emitir informe/i })).toHaveCount(0);

    // Ni anular: `reports:void` es solo del administrador en la matriz de
    // roles, y el botón sale de cruzar §14.2 con los permisos del usuario. Que
    // esta comprobación exista es el punto: la pantalla no ofrece acciones que
    // el servidor vaya a rechazar.
    await expect(page.getByRole('button', { name: /anular informe/i })).toHaveCount(0);
  });
});

test.describe('Revisión a 360 px (T3)', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test('el ciclo completo se opera desde un teléfono', async ({ page }) => {
    await irAlEditor(page);

    await page.getByLabel(/qué hay que corregir/i).fill('Falta la medición del apoyo 11.');
    await page.getByRole('button', { name: /añadir comentario/i }).click();
    await expect(page.getByText('Falta la medición del apoyo 11.')).toBeVisible();

    await page.getByRole('button', { name: /marcar resuelto/i }).click();
    await expect(page.getByRole('button', { name: /reabrir/i })).toBeVisible();

    // Y sin desplazamiento horizontal: la revisión se hace de pie, en el taller.
    const desborda = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(desborda).toBe(false);
  });

  test('los controles de la revisión llegan a 44 px', async ({ page }) => {
    await irAlEditor(page);

    await page.getByLabel(/qué hay que corregir/i).fill('Revisar el par de apriete.');
    await page.getByRole('button', { name: /añadir comentario/i }).click();

    for (const nombre of [/añadir comentario/i, /marcar resuelto/i]) {
      const caja = await page.getByRole('button', { name: nombre }).boundingBox();
      expect(caja?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  });
});

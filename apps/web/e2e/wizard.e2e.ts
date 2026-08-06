import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * Criterios de aceptación de F1 que solo se pueden comprobar en un navegador
 * de verdad:
 *
 *  · el wizard se completa **solo con teclado**, incluido reordenar bloques (T2)
 *  · el editor es usable a **360 px** (T3)
 *  · enviar con errores muestra los campos faltantes **navegables por clic**,
 *    no un aviso genérico (UX-07)
 *
 * La API se sustituye por respuestas fijas: el comportamiento del servidor ya
 * está probado en `apps/api`, y lo que se verifica aquí es lo que ocurre en la
 * pantalla. Meter una base de datos en medio solo añadiría motivos de fallo
 * ajenos a lo que se quiere medir.
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
    {
      clave: 'contexto',
      numeral: 'III',
      titulo: 'Contexto del servicio',
      orden: 2,
      paso: 2,
      bloques: [
        {
          clave: 'antecedentes',
          tipo: 'rich_text',
          titulo: 'Antecedentes',
          orden: 1,
          obligatorio: true,
        },
      ],
    },
    {
      clave: 'trabajos',
      numeral: 'V',
      titulo: 'Trabajos realizados',
      orden: 3,
      paso: 3,
      bloques: [{ clave: 'trabajos', tipo: 'work_task', titulo: 'Trabajo realizado', orden: 1 }],
    },
  ],
};

const bloque = (id: string, orden: number, titulo: string) => ({
  id,
  clave: 'trabajos',
  tipo: 'work_task',
  orden,
  titulo,
  texto: 'Se desmonta el componente.',
  fotos: [],
  visible: true,
});

/** Estado del informe simulado; el reordenamiento lo modifica de verdad. */
function informeInicial() {
  return {
    _id: 'r1',
    numeroInforme: 'ITS-T-E-26-003-0746',
    numeroOt: 'LIM-TAL-000746',
    templateCodigo: 'SER-FOR-002',
    templateVersion: 'v01',
    templateSnapshot: null,
    estado: 'borrador',
    cliente: { id: 'c1', nombre: 'SPCC. TOQUEPALA' },
    sede: { id: null, nombre: null },
    equipo: { categoria: 'camion_minero' },
    motor: {},
    datos: {},
    bloques: [
      bloque('b1', 1, 'DESMONTAJE DE CULATAS'),
      bloque('b2', 2, 'DESMONTAJE DE PISTONES'),
      bloque('b3', 3, 'DESMONTAJE DE TURBOS'),
    ],
  };
}

const FALTAN = [
  { seccion: 'Contexto del servicio', clave: 'antecedentes', titulo: 'Antecedentes', paso: 2 },
  {
    seccion: 'Datos generales',
    clave: 'identificacion',
    titulo: 'Identificación del informe',
    paso: 1,
  },
];

/** Intercepta la API y la sesión para entrar directamente al editor. */
async function conApiSimulada(page: Page): Promise<void> {
  /**
   * Responde con JSON y las cabeceras de CORS.
   *
   * Sin ellas, el navegador manda un preflight OPTIONS que la simulación
   * contesta con JSON, el preflight falla y el POST muere con ERR_FAILED. Los
   * GET pasaban y los POST no, que era justo lo desconcertante.
   */
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

  /** El preflight se contesta antes que nada. */
  const responder = (manejador: (route: Route) => unknown) => (route: Route) =>
    route.request().method() === 'OPTIONS' ? json(route, {}, 204) : manejador(route);

  const usuario = {
    id: 'u1',
    email: 'rcaceres@detroitpower.pe',
    nombre: 'REYNALDO CÁCERES',
    rol: 'tecnico',
    // Los mismos que le da `ROLE_PERMISSIONS.tecnico`: un tecnico envia a
    // revision, no emite. Recortarlos aqui haria que la pantalla ofreciera
    // menos acciones de las que ofrece de verdad.
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

  let informe = informeInicial();

  await page.route(
    '**/api/v1/auth/refresh',
    responder((r) => json(r, { accessToken: 'tok', user: usuario })),
  );
  await page.route(
    '**/api/v1/auth/login',
    responder((r) => json(r, { accessToken: 'tok', user: usuario })),
  );

  await page.route(
    '**/api/v1/templates/**',
    responder((r) => json(r, PLANTILLA)),
  );

  // El maestro de sedes arranca vacío para el cliente elegido: es el caso en
  // que el técnico tiene que darla de alta desde el propio formulario.
  const sedes: { _id: string; nombre: string }[] = [];

  // La genérica va PRIMERO: en Playwright gana la ruta registrada más tarde,
  // así que la específica de sedes tiene que ir después para no quedar tapada.
  // Con el orden al revés, el alta inline recibía el listado del maestro en vez
  // del registro creado, y llegaba sin `_id`.
  await page.route(
    '**/api/v1/masters/**',
    responder((r) =>
      json(r, {
        total: 1,
        items: [{ _id: 'c1', nombreCorto: 'SPCC. TOQUEPALA', nombre: 'SPCC. TOQUEPALA' }],
      }),
    ),
  );

  await page.route(
    '**/api/v1/masters/sites**',
    responder(async (route) => {
      if (route.request().method() === 'POST') {
        const datos = route.request().postDataJSON() as { nombre: string };
        const creada = {
          _id: `s${sedes.length + 1}`,
          nombre: datos.nombre,
          pendienteValidacion: true,
        };
        sedes.push(creada);
        return json(route, creada, 201);
      }
      return json(route, { total: sedes.length, items: sedes });
    }),
  );

  await page.route(
    '**/api/v1/reports/r1/validacion',
    responder((r) => json(r, { emitible: false, faltan: FALTAN })),
  );

  await page.route(
    '**/api/v1/reports/r1/bloques/reordenar',
    responder(async (route) => {
      const { desde, hasta } = route.request().postDataJSON() as { desde: number; hasta: number };
      const orden = [...informe.bloques].sort((a, b) => a.orden - b.orden);
      const [movido] = orden.splice(desde, 1);
      orden.splice(hasta, 0, movido as (typeof orden)[number]);
      informe = { ...informe, bloques: orden.map((b, i) => ({ ...b, orden: i + 1 })) };
      await json(route, informe);
    }),
  );

  await page.route(
    '**/api/v1/reports/r1',
    responder((route) => {
      if (route.request().method() !== 'PATCH') return json(route, informe);

      // Se aplican los cambios de verdad. Devolver el informe intacto —como
      // hacía antes esta simulación— hace que el autoguardado pise lo que el
      // técnico acaba de elegir un segundo después, que es un comportamiento
      // que el servidor real no tiene.
      const cambios = route.request().postDataJSON() as Record<string, unknown>;
      const copia = structuredClone(informe) as unknown as Record<string, unknown>;

      for (const [ruta, valor] of Object.entries(cambios)) {
        const tramos = ruta.split('.');
        let actual = copia;
        for (const tramo of tramos.slice(0, -1)) {
          if (typeof actual[tramo] !== 'object' || actual[tramo] === null) actual[tramo] = {};
          actual = actual[tramo] as Record<string, unknown>;
        }
        actual[tramos[tramos.length - 1] as string] = valor;
      }

      informe = copia as unknown as typeof informe;
      return json(route, { guardadoEn: new Date().toISOString(), informe });
    }),
  );

  await page.route(
    '**/api/v1/reports/r1/estado',
    responder((r) =>
      json(
        r,
        {
          status: 400,
          title: 'Solicitud inválida',
          detail: 'Faltan 2 datos obligatorios para enviar a revisión.',
          faltan: FALTAN,
        },
        400,
      ),
    ),
  );
}

const irAlEditor = async (page: Page) => {
  await conApiSimulada(page);
  await page.goto('/informes/r1');
  await expect(page.getByRole('heading', { name: /ITS-T-E-26-003-0746/ })).toBeVisible();
};

test.describe('Editor de informes', () => {
  test('el número, el estado y el guardado están siempre visibles', async ({ page }) => {
    await irAlEditor(page);

    await expect(page.getByRole('status').filter({ hasText: /guardado|cambios/i })).toBeVisible();
    await expect(page.getByText('borrador')).toBeVisible();
  });

  test.describe('teclado (T2)', () => {
    test('se llega a los pasos y a los campos sin tocar el ratón', async ({ page }) => {
      await irAlEditor(page);

      // Se recorre con Tab hasta encontrar algo enfocable de cada tipo. Si el
      // recorrido se rompiera, no aparecería ninguno.
      const enfocables = new Set<string>();
      for (let i = 0; i < 40; i++) {
        await page.keyboard.press('Tab');
        const info = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el) return '';
          return `${el.tagName.toLowerCase()}${el.getAttribute('role') ? ':' + el.getAttribute('role') : ''}`;
        });
        if (info) enfocables.add(info);
      }

      expect([...enfocables].some((e) => e.startsWith('button'))).toBe(true);
      expect([...enfocables].some((e) => e.startsWith('input'))).toBe(true);
    });

    test('el foco siempre se ve', async ({ page }) => {
      await irAlEditor(page);
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');

      // Sin anillo visible, el recorrido por teclado es inservible aunque
      // funcione (§9 del sistema de diseño).
      const anillo = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        const estilo = getComputedStyle(el);
        return {
          outline: estilo.outlineWidth,
          sombra: estilo.boxShadow,
        };
      });
      expect(anillo.outline !== '0px' || anillo.sombra !== 'none').toBe(true);
    });

    test('los bloques se reordenan con Control+flechas y el foco los sigue', async ({ page }) => {
      await irAlEditor(page);
      await page.getByRole('button', { name: /^3\s*Trabajos/ }).click();

      const bloques = page.locator('li[aria-roledescription="Bloque reordenable"]');
      await expect(bloques).toHaveCount(3);
      await expect(bloques.first()).toContainText('DESMONTAJE DE CULATAS');

      // Se enfoca el tercero y se sube con el teclado.
      await bloques.nth(2).focus();
      await page.keyboard.press('Control+ArrowUp');

      await expect(bloques.nth(1)).toContainText('DESMONTAJE DE TURBOS');

      // El foco viaja con el bloque: sin eso, la siguiente pulsación movería
      // otro y reordenar sin ratón no serviría de nada.
      await expect(bloques.nth(1)).toBeFocused();

      await page.keyboard.press('Control+ArrowUp');
      await expect(bloques.first()).toContainText('DESMONTAJE DE TURBOS');
    });

    test('cada bloque explica cómo moverlo', async ({ page }) => {
      await irAlEditor(page);
      await page.getByRole('button', { name: /^3\s*Trabajos/ }).click();

      const ayuda = page.locator('#dps-ayuda-reordenar');
      await expect(ayuda).toContainText(/Control/i);
      await expect(
        page.locator('li[aria-describedby="dps-ayuda-reordenar"]').first(),
      ).toBeVisible();
    });
  });

  test.describe('alta inline (§13.3.1)', () => {
    test('crea la sede desde el formulario sin perder el borrador', async ({ page }) => {
      await irAlEditor(page);

      // El técnico escribe algo en otro campo: eso es el borrador en curso.
      const numeroOt = page.getByLabel(/de O\/T/i);
      await numeroOt.fill('LIM-TAL-000999');

      const sede = page.getByLabel(/ubicación/i);
      await sede.click();
      await sede.fill('TALLER - AREQUIPA');

      // El alta está dentro de la propia lista, alcanzable con la misma flecha.
      const crear = page.getByRole('option', { name: /Crear «TALLER - AREQUIPA»/ });
      await expect(crear).toBeVisible();
      await crear.click();

      // Queda seleccionada...
      await expect(sede).toHaveValue('TALLER - AREQUIPA');

      // ...y lo que estaba escrito sigue ahí: no se navegó a ninguna parte.
      // Si el alta obligara a salir del informe, el técnico volvería al texto
      // libre y el catálogo dejaría de servir.
      await expect(numeroOt).toHaveValue('LIM-TAL-000999');
      await expect(page.getByRole('heading', { name: /ITS-T-E-26-003-0746/ })).toBeVisible();
    });

    test('el alta se alcanza solo con teclado', async ({ page }) => {
      await irAlEditor(page);

      const sede = page.getByLabel(/ubicación/i);
      await sede.click();
      await sede.fill('TALLER - TRUJILLO');
      await expect(page.getByRole('option', { name: /Crear «TALLER - TRUJILLO»/ })).toBeVisible();

      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');

      await expect(sede).toHaveValue('TALLER - TRUJILLO');
    });
  });

  test.describe('campos faltantes (UX-07)', () => {
    test('al enviar con errores sale la lista, no un aviso genérico', async ({ page }) => {
      await irAlEditor(page);

      // Se va al último paso y se intenta enviar a revisión, que es lo que
      // puede hacer un técnico: emitir es del supervisor (§14.2).
      await page.getByRole('button', { name: /^3\s*Trabajos/ }).click();
      await page.getByRole('button', { name: /enviar a revisión/i }).click();

      const panel = page.getByRole('heading', { name: /faltan .* datos para emitir/i });
      await expect(panel).toBeVisible();

      // Cada punto es un botón, no una línea de texto muerta.
      await expect(page.getByRole('button', { name: /Antecedentes/ })).toBeVisible();
    });

    test('pulsar un punto lleva a su paso', async ({ page }) => {
      await irAlEditor(page);
      await page.getByRole('button', { name: /^3\s*Trabajos/ }).click();
      await page.getByRole('button', { name: /enviar a revisión/i }).click();

      await page.getByRole('button', { name: /Antecedentes/ }).click();

      // El aviso decía «paso 2»: el editor tiene que estar ahí.
      await expect(page.getByRole('heading', { name: /Contexto del servicio/ })).toBeVisible();
    });
  });
});

test.describe('Editor a 360 px (T3)', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test('no hay desplazamiento horizontal', async ({ page }) => {
    await irAlEditor(page);

    // Es el defecto que hace inservible una pantalla en móvil: leer una fila
    // obliga a desplazarse en dos ejes.
    const desborda = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(desborda).toBe(false);
  });

  test('las acciones de avanzar y enviar quedan al alcance del pulgar', async ({ page }) => {
    await irAlEditor(page);

    const siguiente = page.getByRole('button', { name: /siguiente/i });
    const caja = await siguiente.boundingBox();
    expect(caja).not.toBeNull();

    // Fija abajo: el técnico trabaja de pie junto al motor.
    expect((caja?.y ?? 0) + (caja?.height ?? 0)).toBeGreaterThan(740 * 0.7);
  });

  test('los objetivos táctiles llegan a 44 px', async ({ page }) => {
    await irAlEditor(page);

    const botones = page.getByRole('button');
    const total = await botones.count();
    const pequenos: string[] = [];

    for (let i = 0; i < total; i++) {
      const boton = botones.nth(i);
      if (!(await boton.isVisible())) continue;
      const caja = await boton.boundingBox();
      if (caja && (caja.height < 44 || caja.width < 24)) {
        pequenos.push(
          `${(await boton.textContent())?.trim() || '(icono)'} ${caja.width}×${caja.height}`,
        );
      }
    }

    expect(pequenos, `Objetivos por debajo de 44 px: ${pequenos.join(' · ')}`).toEqual([]);
  });

  test('el paso a paso se puede recorrer sin que se salga de la pantalla', async ({ page }) => {
    await irAlEditor(page);

    const pasos = page.getByRole('navigation', { name: /pasos del informe/i });
    await expect(pasos).toBeVisible();

    // La tira de pasos se desplaza por dentro, sin arrastrar la página.
    const anchoPagina = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(anchoPagina).toBeLessThanOrEqual(361);
  });
});

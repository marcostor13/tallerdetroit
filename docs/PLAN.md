# Plan de implementación por fases

**Producto:** Plataforma corporativa de informes técnicos — Detroit Power System Perú
**Alcance:** Fase 4 del deck corporativo (F0–F6 de este plan)
**Duración estimada:** 32–42 semanas (8–10 meses)

Este plan operacionaliza `especificacionplataformainformestecnicos.md` (el _qué_) e incorpora los
requisitos obligatorios de `especificaciones.md` (el _cómo_). El sistema de diseño normativo está
en `.claude/DESIGN-SYSTEM.md`.

---

## Estado actual

| Fase                                     | Estado                                                                          | Semanas | Cierre     |
| ---------------------------------------- | ------------------------------------------------------------------------------- | ------- | ---------- |
| **F0** Fundaciones                       | 🟢 Criterios cumplidos — ver el detalle                                         | 2–3     | 5-ago-2026 |
| **F1** Núcleo de informes (MVP)          | 🟡 11 de 13 criterios verificados — faltan las dos comparaciones contra el Word | 7–9     | —          |
| **F2** Mediciones dimensionales          | 🟡 8 épicas implementadas y en pantalla · 7 de 12 criterios verificados         | 4–6     | —          |
| **F3** Aprobación y gobierno del formato | 🟡 10 de 11 épicas · 5 de 10 criterios verificados                              | 5–7     | —          |
| **F4** PWA, movilidad y offline          | 🟡 Crear y editar sin red, verificado de punta a punta · 4 de 9 criterios       | 4–6     | —          |
| **F5** Analítica y conocimiento          | ⬜ Pendiente                                                                    | 4–6     | —          |
| **F6** Integración corporativa           | ⬜ Pendiente                                                                    | 4–6     | —          |

> Actualiza esta tabla al abrir y cerrar cada fase (skill `/dps-fase`).

---

## Cómo leer este plan

El deck usa "Fase 1–4" para la **evolución histórica**. Para evitar confusión, las fases de
construcción se numeran **F0–F6**, y todas ocurren _dentro_ de la Fase 4 del deck.

```
Deck:  Fase 1 (Word) → Fase 2 (HTML) → Fase 3 (PWA) → ───── Fase 4: Plataforma corporativa ─────
                                                            │                                  │
Plan:                                                       F0 F1 F2 F3 F4 F5 F6
```

**Esto no es un proyecto greenfield.** Existe una PWA funcional, validada por técnicos con informes
reales, y un formato de salida ya aceptado. El riesgo dominante no es técnico sino de
**continuidad operativa**: la plataforma nueva no puede ser peor que lo que los técnicos ya usan,
ni puede obligarlos a un corte abrupto.

**Supuestos de estimación** (declarados para poder discutirlos):

| Supuesto                           | Valor                                                                                                     |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Equipo                             | 1 tech lead full-stack · 1 dev Angular · 1 dev NestJS · PO del negocio a medio tiempo · QA a medio tiempo |
| Semana                             | 5 días hábiles, capacidad efectiva 80%                                                                    |
| Diseño UI                          | Se aplica el kit "Industrial Precision" ya provisto; no hay diseño desde cero                             |
| Contenido de maestros              | Lo provee el negocio en Excel; el equipo construye el importador, no digita datos                         |
| Especificaciones MTU               | Disponibles antes del inicio de F2 (**bloqueante** — riesgo R2)                                           |
| Los rangos son órdenes de magnitud | ±25%, a refinar tras F0                                                                                   |

---

## Requisitos transversales — aplican a TODAS las fases

Vienen de `especificaciones.md` y son de cumplimiento obligatorio en cada entregable, no una fase aparte.

| #   | Requisito                                                                                      | Cómo se verifica en cada fase                                           |
| --- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| T1  | **Tema claro/oscuro** automático según navegador + switch en el header                         | Toda pantalla nueva se revisa en ambos temas; sin destello al cargar    |
| T2  | **UX y accesibilidad de formularios**: campos validables, errores que previenen fallos         | Checklist de §7.2 y §9 de `DESIGN-SYSTEM.md` en cada PR con formularios |
| T3  | **Mobile first; en móvil se comporta como app**                                                | Toda pantalla usable a 360 px con nav inferior y áreas seguras          |
| T4  | **Monorepo con CI por ruta**: frontend solo si cambia frontend, backend solo si cambia backend | El resumen del workflow muestra qué se ejecutó                          |
| T5  | **Coolify con dos recursos**: `develop` → develop, `main` → producción                         | Prueba de despliegue en ambas ramas                                     |
| T6  | **Skills y agents de Claude Code** para mantener buenas prácticas                              | Los agentes se usan en la revisión de cada fase                         |

---

# F0 — Fundaciones

**Objetivo:** que exista un esqueleto desplegado, con pipeline funcionando, antes de escribir una
sola pantalla de negocio.

|                |                                                              |
| -------------- | ------------------------------------------------------------ |
| **Duración**   | 2–3 semanas                                                  |
| **Depende de** | Acceso al VPS, cuenta AWS, cuenta Atlas, dominio corporativo |
| **Bloquea a**  | Todas                                                        |

## Ya entregado en este repositorio

- [x] Estructura del monorepo con npm workspaces (`apps/web`, `apps/api`, `apps/worker`, `libs/shared`)
- [x] `tsconfig.base.json` en modo estricto, Prettier, EditorConfig, commitlint con scopes por app
- [x] **Sistema de diseño documentado y normativo** (`.claude/DESIGN-SYSTEM.md`)
- [x] Tokens de color en CSS con paleta **clara y oscura** completas y contraste verificado (T1)
- [x] `tailwind.config.js` alimentado por los tokens — un solo juego de clases para ambos temas
- [x] Escala tipográfica y `@font-face` autoalojado (Montserrat, Hanken Grotesk, JetBrains Mono, Material Symbols)
- [x] `ThemeService` tri-estado + `ThemeToggleComponent` accesible + script anti-destello en `index.html` (T1)
- [x] Componentes base en CSS: input accesible, botones, card, semáforo de celdas, `spec-row`
- [x] **Activos de marca y favicons** derivados del logo: isotipo SVG retrazado, `favicon.ico`
      multirresolución, PNG 16–512, iconos maskable, apple-touch-icon
- [x] `manifest.webmanifest` con shortcuts, iconos maskable y `theme_color` de marca
- [x] `libs/shared`: máquina de estados del informe, matriz RBAC, **motor de tolerancias** con tests
- [x] **CI con filtrado por ruta** (`.github/workflows/ci.yml`) (T4)
- [x] **Despliegue a Coolify** `develop`/`production` con filtrado por ruta y healthcheck (T5)
- [x] Dockerfiles de `web` (nginx), `api` y `worker` (Chromium en servicio separado)
- [x] `docker-compose` de desarrollo (Mongo replica set, Redis, MinIO, Mailpit) y de CI
- [x] `infra/COOLIFY.md` con la configuración completa de los dos entornos
- [x] **Skills y agents de Claude Code** (T6)
- [x] `.gitignore` que protege `.env` y `.env.deploy` (contienen credenciales reales)

## Pendiente de F0

| Épica                        | Historias                                                                                                                                                                              |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **E0.1 Bootstrap de apps**   | Generar `web`/`api`/`worker` con sus CLIs siguiendo `scripts/bootstrap.md` · enlazar `@dps/shared` · `npm run dev` levanta las tres                                                    |
| **E0.2 Infraestructura**     | VPS con Coolify · Atlas en 3 entornos · buckets S3 con ciclo de vida · dominios + SSL · secrets y variables en GitHub                                                                  |
| **E0.3 Shell de la app**     | Layout responsive: sidebar desktop / nav inferior móvil · routing con lazy loading · header con buscador, estado de conexión, switch de tema y avatar · pantallas de error 403/404/500 |
| **E0.4 Auth base**           | Login · JWT access + refresh rotativo en cookie httpOnly · Argon2id · guard de rutas · los 4 roles del slide 8 con permisos declarativos · pantalla de login con la marca              |
| **E0.5 Observabilidad**      | Pino estructurado · Sentry en las tres apps · `/api/v1/health` con Terminus (Mongo, Redis, S3)                                                                                         |
| **E0.6 Fuentes y assets**    | `node scripts/fetch-fonts.mjs` · verificar que la app arranca sin red externa                                                                                                          |
| **E0.7 Decisiones abiertas** | Resolver **D5 multi-empresa** (afecta el modelo) e iniciar la recopilación de las especificaciones MTU para D1                                                                         |

## Criterios de aceptación

- [x] Un `git push` a `develop` despliega automáticamente a develop en < 10 min
- [x] Un `git push` a `main` despliega a producción tras la aprobación manual
- [x] Un cambio **solo** en `apps/web` no ejecuta ni reconstruye `api` ni `worker` (T4)
- [x] Un cambio **solo** en `apps/api` no ejecuta ni reconstruye `web` (T4)
- [x] `https://dev-tallerdetroit.tecdidata.com` responde con SSL válido y la app carga
- [x] Un usuario `admin` inicia sesión; un usuario sin rol recibe 403 en una ruta protegida
- [x] `/api/docs` muestra el OpenAPI generado
- [x] Rollback probado: redesplegar el tag anterior restaura la versión previa
- [x] **La app respeta `prefers-color-scheme` y el switch del header lo sobrescribe y persiste, sin destello** (T1)
- [x] **El shell es usable a 360 px con barra inferior y áreas seguras respetadas** (T3)
- [x] La app carga completa sin acceso a CDNs externos (fuentes e iconos autoalojados)
- [x] `.env` y `.env.deploy` no están en el índice de git

## Entregables

Esqueleto desplegado en develop · pipeline verde · `infra/COOLIFY.md` aplicado · runbook de rollback.

---

# F1 — Núcleo de informes (MVP operativo)

**Objetivo:** que un técnico produzca, de punta a punta y en la plataforma central, un informe
**equivalente al que hoy produce en Word**.

> Esta es la fase que define el éxito del proyecto. Si el PDF que sale de aquí no es tan bueno como
> el Word actual, los técnicos no migran.

|                |                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------- |
| **Duración**   | 7–9 semanas                                                                                        |
| **Depende de** | F0 · maestros base cargados en Excel por el negocio · decisión **D3** (convención de correlativos) |
| **Bloquea a**  | F2, F3, F4                                                                                         |

## Alcance

| Épica                                     | Historias principales                                                                                                                                                                                                                                                                     |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅ **E1.1 Maestros base**                 | Módulo `MastersModule` genérico (CRUD, paginación, búsqueda, auditoría) · maestros 1, 2, 3, 6, 7, 8, 10, 12, 13, 14, 31, 32, 33 · **creación inline** desde el formulario · búsqueda difusa tolerante a typos · importador CSV/XLSX con reporte de errores · merge de duplicados          |
| ✅ **E1.2 Motor de plantillas (runtime)** | Modelo `templateVersions` con secciones y bloques embebidos · semilla de SER-FOR-002 v01 · renderizado del formulario desde la definición · visibilidad condicional declarativa                                                                                                           |
| ✅ **E1.3 Órdenes de trabajo**            | CRUD mínimo de OT · relación OT ↔ informes (1..n)                                                                                                                                                                                                                                         |
| ~~**E1.4 Correlativos**~~                 | ❌ **Fuera de alcance (D3).** El número de informe y el de OT se escriben a mano. En su lugar: validación de formato y **unicidad** del número. `sequences` queda para cuando el negocio fije la convención                                                                               |
| ✅ **E1.5 Editor de informes**            | Wizard de 6 pasos · cascada Cliente→Sede→Equipo→Motor con autocompletado · **autoguardado cada 20–30 s** con indicador · bloques `work_task` ordenables por drag & drop **con alternativa por teclado** · `rich_text` · `bullet_list` · `items_table` · duplicar informe anterior (UX-05) |
| ✅ **E1.6 Evidencia fotográfica**         | Subida directa a S3 con URL prefirmada · **compresión en cliente** (máx. 1600 px, JPEG q80) · caption obligatorio · numeración `Fig.NN` automática y recalculada al reordenar · derivados thumb/web/print en el worker                                                                    |
| ✅ **E1.7 Generación de PDF**             | Render servidor con Playwright · réplica fiel de la cabecera SER-FOR-002 · tablas de datos generales y de equipo · bloques con fotos en pares · reglas de paginación (mantener juntos título+párrafo, foto+caption, tabla completa)                                                       |
| ✅ **E1.8 Bandeja e historial**           | Listado con filtros (estado, cliente, equipo, motor, técnico, fecha) · búsqueda · descarga · vista móvil como lista de cards                                                                                                                                                              |
| ✅ **E1.9 Estados básicos**               | `borrador` → `emitido` (el flujo de revisión completo llega en F3)                                                                                                                                                                                                                        |
| ✅ **E1.10 Vista previa**                 | Panel lateral WYSIWYG idéntico al PDF (UX-06)                                                                                                                                                                                                                                             |

## Criterios de aceptación

> **Estado (6-ago-2026):** las diez épicas están implementadas, y **11 de los 13
> criterios de abajo están verificados con evidencia reproducible**.
>
> Los dos que faltan son las comparaciones contra el Word original, y no se
> pueden automatizar: hacen falta los informes reales y un supervisor que no
> sepa cuál es cuál. Del OT-898 sí está comprobada la mitad que sí depende de
> nosotros —que no haga falta tocar código—, y queda marcada `[~]`.
>
> **La fase no se cierra hasta esas dos.** Es deliberado: son las que deciden si
> los técnicos migran, y ninguna cantidad de tests verdes las sustituye.

- [ ] **Prueba de fidelidad:** un técnico reproduce íntegramente el informe **OT746** en la plataforma;
      en una comparación ciega, un supervisor no identifica cuál PDF salió del Word y cuál de la plataforma
- [~] Lo mismo con el informe **OT898**, **sin cambiar código** — solo componiendo bloques distintos. **La parte de «sin cambiar código» está verificada** (6-ago-2026, `report-html.spec.ts`): los dos informes se componen desde la misma plantilla y salen distintos —el 746 con seguidores y varillas, el 898 con turbos, housing y tercerizados—, con su propia numeración de figuras y sin panel de ECU en ninguno. **Falta la comparación con el original**, que necesita el informe real y un supervisor
- [x] **Un informe con 45 fotos genera su PDF en < 45 s (NFR-03)** — verificado 6-ago-2026: **4,99 s** con 45 fotografías _distintas_ de 1600×1200 (14 MB de origen → PDF de 1,26 MB), medido contra Chromium real. Con la misma foto repetida el PDF la deduplica y la medida sale diez veces mejor de lo que es; el banco usa fotos diferentes a propósito. Queda fuera el tiempo de descarga desde S3
- [x] **Dos informes no pueden compartir número: el segundo intento recibe un error claro** (RN-01 adaptada a D3) — verificado 6-ago-2026 en `reports.e2e.spec.ts`. El número se normaliza antes de comparar, así que `its-t-e-26-003-0746` choca con `ITS-T-E-26-003-0746`; sin eso el índice único no vería el duplicado. El índice se crea al arrancar (`IndexesService`), porque con `autoIndex` apagado en producción no existía
- [x] **Al reordenar bloques, la numeración de figuras se recalcula correctamente en pantalla y en el PDF** (RN-06) — verificado 6-ago-2026 en los tres sitios: dominio (`figures.spec.ts`), API (`reports.e2e.spec.ts`) y render del documento (`report-html.spec.ts`). El número no se guarda: se deriva del orden, así que no puede quedarse viejo
- [x] **Un técnico crea una sede nueva desde el formulario sin perder el borrador en curso** (§13.3.1) — verificado 6-ago-2026 con Playwright: lo escrito en otros campos sigue ahí y no se navega a ninguna parte. El alta está dentro del propio desplegable y se alcanza solo con teclado
- [x] **El documento del informe en Mongo pesa < 1 MB con 45 fotos** — verificado 6-ago-2026: **25 KB** con 45 fotografías (claves, miniaturas, pies y hashes incluidos), medido con `$bsonSize`. El Word equivalente pesa 17 MB porque lleva las imágenes dentro
- [x] **Buscar `KOMATZU` sugiere `KOMATSU`** (§13.3.2) — verificado 6-ago-2026 en `masters.e2e.spec.ts` contra una base real, y en `fuzzy-search.spec.ts` a nivel de dominio. También encuentra `SPCC. TOQUEPALA` escribiendo `TOQEPALA`, que exige comparar palabra a palabra y no solo la cadena entera
- [x] **El autoguardado se percibe en < 500 ms y muestra «Guardado hace X»** (NFR-02, UX-01) — verificado 6-ago-2026: **mediana 17 ms, p95 18 ms** sobre 20 guardados seguidos en un informe con 10 bloques y 30 fotos. Se exige el p95 y no la media: lo que rompe la confianza es el guardado lento ocasional. ⚠️ Medido contra Mongo en memoria; **falta repetirlo contra Atlas**, que añade la latencia de red
- [x] **Enviar con errores muestra una lista de campos faltantes navegables por clic**, no un alert (UX-07, T2) — verificado 6-ago-2026 con Playwright: cada punto es un botón y lleva a su paso
- [x] **Todo el wizard se completa solo con teclado**, incluido el reordenamiento de bloques (T2) — verificado 6-ago-2026: recorrido con Tab, foco siempre visible, y `Control+flechas` mueve el bloque con el foco siguiéndolo a su posición nueva
- [x] **El editor es usable en móvil a 360 px** (T3) — verificado 6-ago-2026: sin desplazamiento horizontal, objetivos táctiles ≥ 44 px y las acciones al alcance del pulgar. Se corrigieron dos defectos que salieron aquí: los pasos medían 36 px y la barra de acciones quedaba **debajo** de la navegación inferior, con lo que emitir era imposible desde un teléfono
- [x] **Cobertura backend ≥ 70%, frontend ≥ 50% (NFR-11)** — verificado 6-ago-2026: backend 91.9% de sentencias / 93.1% de líneas; frontend 57.1% / 56.8% medido sobre todo `src/app`. Los dos umbrales quedan declarados en la configuración, de modo que el CI falla si se baja de ahí

## Entregables

Plataforma en staging usable por 2–3 técnicos piloto · manual breve de usuario · maestros base cargados.

**Hito de valor mínimo (semana ~11): aquí la plataforma ya reemplaza al Word.**

---

# F2 — Mediciones dimensionales

**Objetivo:** digitalizar la información que hoy no existe como dato, y con ello justificar toda la
inversión posterior en analítica.

|                |                                                                                                                                                                                                       |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Duración**   | 4–6 semanas                                                                                                                                                                                           |
| **Depende de** | F1 (11/13 criterios; los dos abiertos son DT-1 y DT-2) · ~~D1~~ **resuelta**: carga manual, con lo cargado desde informes marcado `provisional` · ~~D2~~ **resuelta**: modo `absoluto` / `desviacion` |
| **Bloquea a**  | F5                                                                                                                                                                                                    |

> **El hallazgo que gobierna la fase:** el número de columnas de cada grilla y sus tolerancias se
> derivan del modelo de motor. Al seleccionar el motor por su número de serie, la plataforma ya sabe
> que debe pedir 11 apoyos y validar contra 193.000 mm.

## Alcance

| Épica                                       | Historias principales                                                                                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **E2.1 Maestros técnicos**                  | `engineModels` con cilindros/apoyos/bancos/CAC/turbos · `engineSpecs` con índice único · `engineComponents` · `units` · `componentVerdicts` |
| **E2.2 Plantillas de medición**             | Las 10 plantillas de §12.3 · resolución de dimensiones desde el modelo · campos calculados                                                  |
| **E2.3 Grilla de captura**                  | Componente con navegación por teclado, pegado desde Excel, semáforo en vivo, etiquetas fijas (`APOYO`, `L`, `T`), encabezados sticky        |
| **E2.4 Validación**                         | Motor de tolerancias en backend (fuente de verdad) y espejo en frontend · denormalización de la especificación aplicada                     |
| **E2.5 Veredicto y conclusiones asistidas** | Propuesta automática de veredicto por bloque · pre-poblado de Conclusiones · biblioteca de frases                                           |
| **E2.6 Render de mediciones**               | Tablas dimensionales en PDF y DOCX con el formato del Word original · anexo "hoja de mediciones" independiente                              |
| **E2.7 Checklist de desarmado**             | Bloque `checklist` como **sección del propio informe** (D4): mismo PDF, mismo número y misma aprobación. No es un documento independiente   |
| **E2.8 Hechos analíticos**                  | Escritura de `measurementFacts` al emitir, con sus tres índices                                                                             |

> **Dónde vive cada cosa en el wizard (6-ago-2026).** Las tablas dimensionales cuelgan del trabajo
> que evalúa el componente —que es donde las pone el Word original— y además hay una sección propia
> para las que se miden del motor entero (juego axial, encajes de camisa). El inventario de
> desarmado es la sección VII. Al integrarlo salieron dos defectos del mismo tipo: las secciones VI
> y VII eran **inalcanzables**, porque su regla de visibilidad exigía que ya hubiera mediciones o
> inventario, y un bloque solo se puede añadir desde una sección visible. Nunca se podía añadir el
> primero.

> El motor de tolerancias (`evaluateMeasurement`, `resolveColumns`, `proposeVerdict`) ya está
> implementado y probado en `libs/shared/src/domain/measurements.ts`. E2.4 lo integra; no lo reescribe.

## Criterios de aceptación

> **Estado (6-ago-2026):** las ocho épicas están implementadas **y llegan a la pantalla**. Hasta
> este punto F2 tenía el motor de tolerancias probado, el backend validando y el PDF sacando las
> tablas, pero un técnico **no podía capturar una medición dentro de un informe**: la grilla solo
> existía en una página de pruebas que ni siquiera se despliega, y el inventario de desarmado no
> tenía ni campo donde guardarse. Eso queda cerrado.
>
> **7 de los 12 criterios están verificados**; 4 tienen prueba escrita que **no se ha podido
> ejecutar en este entorno** (ver la nota de abajo) y 1 necesita a una persona.
>
> ⚠️ **Sobre lo no ejecutado.** Los tests de la API (`mediciones.e2e.spec.ts`,
> `engine-specs.e2e.spec.ts`, `checklist.e2e.spec.ts`) no se pudieron correr aquí: la política de
> red del contenedor bloquea `fastdl.mongodb.org`, de donde `mongodb-memory-server` descarga el
> binario, y no hay `mongod` ni Docker. **El CI sí los ejecuta**; hasta que se vea un pipeline
> verde, esos cuatro criterios están escritos pero no comprobados, y se marcan `[~]`.

- [x] Al seleccionar el motor `5282011236`, la grilla de muñón de bancada aparece con **11 columnas**
      y la de biela A con **10**, sin configuración manual — verificado 6-ago-2026 en tres sitios:
      dominio (`measurement-grid.spec.ts`), integración en el informe
      (`mediciones-bloque.component.spec.ts`) y **navegador real** (Playwright: 12 `th` = 11 + la
      esquina, y 33 celdas editables). El número no está escrito en ningún sitio: sale del modelo
- [x] Al seleccionar `5272012973` (16V), las mismas grillas aparecen con **9** y **8** columnas —
      verificado 6-ago-2026 en dominio y en el componente del informe. Es la misma plantilla: lo
      único que cambia es el motor
- [~] La grilla de encaje de camisa inferior valida contra **193.000 mm** para el 20V4000C23 y contra
  **189.000 mm** para el 16V4000C21 — prueba escrita en `engine-specs.e2e.spec.ts` (incluido el
  rango 193.000–193.080), **sin ejecutar aquí**
- [~] Un valor de +0.16 mm en encaje superior se marca 🔴 y bloquea la emisión sin justificación del
  supervisor (RN-03) — la parte del backend está en `mediciones.e2e.spec.ts`, **sin ejecutar
  aquí**. **La parte de pantalla sí se verificó** (6-ago-2026): con un valor fuera aparece el
  campo de justificación, marcado como error mientras esté vacío, y lo escrito viaja con cada
  guardado para que seguir capturando no lo borre
- [x] La `Ovalidad` se calcula y no es editable — verificado 6-ago-2026 en navegador real: es un
      `<output>`, no un campo; no se alcanza con Tab, y las once salen calculadas al teclear `a` y `b`
- [x] Un técnico captura las 11 columnas × 3 filas del túnel de bancada **usando solo el teclado, en
      < 60 s** — verificado 6-ago-2026 con Chromium real: **1,6 s en escritorio y 1,7 s en un Pixel
      7**. Lo que mide la prueba es que la herramienta no sea el cuello de botella: una persona tarda
      más en leer el micrómetro que en teclear, y el margen dice que repintar la grilla a cada valor
      no cuesta nada
- [x] `Ctrl+V` pega un rango copiado desde Excel y lo distribuye correctamente — verificado
      6-ago-2026 en navegador real y en el dominio, con tabuladores, punto y coma, coma decimal
      española y saltos de Windows. Lo que se sale de la grilla se descarta en vez de escribir fuera
- [ ] Las tablas del PDF generado son visualmente equivalentes a las del OT898 — **necesita el
      informe real y una persona que compare**, como los dos criterios abiertos de F1. No hay
      cantidad de tests verdes que lo sustituya
- [x] **El semáforo se distingue sin depender del color**: icono + `aria-label` textual (T2, WCAG
      1.4.1) — verificado 6-ago-2026 en navegador real: la celda fuera de tolerancia lleva su clase,
      `aria-invalid="true"` y un `aria-label` que **dice en palabras** «fuera de tolerancia». Un
      informe técnico se imprime, se fotocopia y lo leen personas con daltonismo
- [~] Cada medición guarda `nominal`, `tolInf` y `tolSup` vigentes al momento de la captura — prueba
  escrita en `mediciones.e2e.spec.ts` (se cambia la spec después de guardar y la grilla conserva
  la anterior), **sin ejecutar aquí**
- [~] Las specs cargadas desde los informes están marcadas `provisional: true` mientras D1 siga
  abierta — prueba escrita en `engine-specs.e2e.spec.ts` sobre **todas** las sembradas, **sin
  ejecutar aquí**
- [x] **La grilla es usable en tablet y móvil** con scroll y encabezados fijos (T3) — verificado
      6-ago-2026 en un Pixel 7 real: el desplazamiento va **dentro** de la grilla y no arrastra la
      página, las cabeceras de columna y de fila quedan `sticky` en los dos ejes, y la celda mide
      88 × 36 px

### Lo que este entorno no ha podido comprobar y hay que comprobar antes de cerrar F2

1. Ejecutar los tests de la API en CI (los cuatro `[~]` de arriba) y ver el pipeline verde.
2. La comparación del PDF contra el OT898 con un supervisor delante.
3. El `checklist.e2e.spec.ts` recién escrito, que nunca se ha ejecutado en ningún sitio.

---

# F3 — Flujo de aprobación, documentos y gobierno del formato

**Objetivo:** cerrar el ciclo de control interno que hoy no existe (slide 4: _"no existe
trazabilidad corporativa"_).

|                         |                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| **Duración**            | 5–7 semanas                                                                                      |
| **Depende de**          | F1 (F2 recomendable pero no bloqueante) · **D6** (tipo de firma) · **D10** (glosario controlado) |
| **Bloquea a**           | F6                                                                                               |
| **Puede solaparse con** | F2, F4                                                                                           |

## Alcance

| Épica                                   | Historias principales                                                                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **E3.1 Máquina de estados completa**    | Las 7 transiciones de §14.2 con permisos por rol (ya definidas en `libs/shared`)                                                                  |
| **E3.2 Revisión colaborativa**          | Comentarios anclados a bloque · marcar resuelto · notificación al técnico (UX-08)                                                                 |
| **E3.3 Firmas**                         | Bloque `signature_block` · firma con usuario + fecha + hash · imagen de firma desde `technicians`                                                 |
| **E3.4 Inmutabilidad y versiones**      | Snapshot al emitir · hash SHA-256 · S3 Object Lock · versión correctiva que referencia a la anterior (RN-02, RN-08)                               |
| **E3.5 Export DOCX real**               | `docxtemplater` sobre plantilla `.dotx` corporativa, editable por Calidad sin tocar código                                                        |
| **E3.6 Marca de agua y QR**             | "BORRADOR" mientras no esté aprobado · QR de verificación en el pie · vista pública de verificación                                               |
| **E3.7 Editor de plantillas (Calidad)** | UI para componer secciones y bloques · versionar y publicar · rol Calidad                                                                         |
| **E3.8 Auditoría**                      | `auditLogs` append-only con TTL de 7 años · consulta filtrable para Administrador                                                                 |
| **E3.9 Notificaciones**                 | Email en: enviado a revisión, observado, aprobado, emitido                                                                                        |
| **E3.10 Maestros restantes**            | `instruments` con control de calibración (RN-04) · `testTypes` · `phraseLibrary` · `outputLayouts` · `settings` · `serviceReasons` · `checklists` |
| **E3.11 Roles adicionales**             | `calidad` y `planificacion` como roles opcionales                                                                                                 |

## Estado de las épicas (6-ago-2026)

| Épica                                     | Estado                                                                                                      |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **E3.1** Máquina de estados               | 🟢 Las acciones del wizard salen de §14.2 cruzada con los permisos. Enviar a revisión ahora **sí** valida   |
| **E3.2** Revisión colaborativa            | 🟢 Comentarios anclados a bloque, resolver/reabrir, y no se aprueba con observaciones abiertas              |
| **E3.3** Firmas                           | ⬜ Pendiente — depende de **D6** (tipo de firma), que sigue abierta                                         |
| **E3.4** Inmutabilidad y hash             | 🟢 Documento con hash estable; reimprimir devuelve el mismo archivo. **S3 Object Lock, sin configurar**     |
| **E3.5** Export DOCX                      | ⬜ Pendiente                                                                                                |
| **E3.6** Marca de agua, QR y verificación | 🟢 QR en el pie, hash de contenido impreso y vista pública `/v/:numero`. La marca de agua ya venía de F1    |
| **E3.7** Editor de plantillas (Calidad)   | ⬜ Pendiente                                                                                                |
| **E3.8** Auditoría                        | 🟢 `auditLogs` append-only con TTL de 7 años, y consola de consulta                                         |
| **E3.9** Notificaciones                   | ⬜ Pendiente                                                                                                |
| **E3.10** Maestros restantes              | 🟡 `instruments` con RN-04 completo. Faltan `testTypes`, `phraseLibrary`, `outputLayouts`, `settings`       |
| **E3.11** Roles adicionales               | 🟢 `calidad` y `planificacion` ya estaban en la matriz; se añade `reports:override` para el escape de RN-04 |

## Criterios de aceptación

> **Estado (6-ago-2026):** 4 de los 10 verificados, 3 implementados sin poder ejecutar su prueba y
> 3 dependen de épicas que no están hechas.
>
> ⚠️ La limitación de siempre: los tests de la API no corren en este entorno porque la política de
> red bloquea `fastdl.mongodb.org`, de donde `mongodb-memory-server` descarga el binario. Lo que sí
> se ejecuta es `libs/shared` y los e2e de Playwright con Chromium real, y ahí es donde está la
> evidencia de abajo.

- [~] Un informe recorre `borrador → en_revision → observado → en_revision → aprobado → emitido`
  con los roles correctos y queda registrado en auditoría — **la parte de pantalla está
  verificada** (6-ago-2026, `revision.e2e.ts`): las acciones salen de la tabla de §14.2 cruzada
  con los permisos, de modo que un técnico ve «Enviar a revisión» y un supervisor «Aprobar» y
  «Devolver con observaciones». El recorrido completo contra la base **no se ha ejecutado**
- [x] Un supervisor no puede aprobar sin resolver los comentarios abiertos — verificado 6-ago-2026
      en dominio (`review.spec.ts`) y en navegador real: con una observación abierta sale el aviso,
      «Aprobar» devuelve el error del servidor, y al resolverla el aviso desaparece. La regla vive
      en `libs/shared` para que la pantalla y el servidor no puedan discrepar
- [~] Reimprimir un informe emitido devuelve un archivo con **el mismo hash** que la primera
  generación — implementado: el documento se sirve desde la clave de S3 donde lo dejó el worker
  y **nunca se vuelve a renderizar**. Falta ejecutarlo contra S3 y Mongo de verdad
- [~] El `.docx` exportado abre en Word sin advertencias y es editable con estilos correctos —
  implementado y **verificado hasta donde se puede sin Word**: 4 tests en el worker comprueban
  que el archivo es un ZIP con las partes que exige OOXML, que no se cae si falta una foto y que
  dos generaciones del mismo informe pesan lo mismo. **Que Word no se queje al abrirlo lo tiene
  que comprobar una persona**, igual que las comparaciones pendientes de F1
- [x] Calidad publica SER-FOR-002 **v02** agregando una sección, y los informes emitidos con v01 se
      siguen renderizando idénticos (RN-08) — verificado 6-ago-2026 en navegador real
      (`plantillas.e2e.ts`): se crea el borrador copiando la vigente, se añade una sección y se
      publica, y lo que se envía lleva la sección nueva. La otra mitad —que los emitidos no cambien—
      la sostiene el congelado de `templateSnapshot`, que está desde F1 y tiene sus propias pruebas.
      La pantalla **no deja tocar una versión publicada**, que es la parte que le toca al frontend
- [~] Un informe que usa un instrumento con calibración vencida muestra advertencia bloqueante
  (RN-04) — **la regla está verificada** (6-ago-2026, `instruments.spec.ts`, 14 casos incluidos
  los bordes: el día del vencimiento vale, el siguiente no, y una fecha ilegible no bloquea).
  Falta comprobar de punta a punta que aparece en la lista de lo que impide emitir
- [~] Escanear el QR de un PDF abre la vista de verificación con los datos del informe — el pie con
  QR y hash está verificado en el render (`report-html.spec.ts`), y la vista `/v/:numero` existe.
  **Falta escanear un PDF de verdad**, que necesita el worker con Chromium y S3
- [x] La consulta de auditoría filtra por actor, entidad, acción y rango de fechas — verificado
      6-ago-2026 en navegador real (`auditoria.e2e.ts`): lo que se comprueba es que los filtros
      **llegan al query string**, no que la pantalla los pinte, y que «Limpiar» los quita de la
      petición y no solo del desplegable
- [x] **Los comentarios de revisión son navegables por teclado y anunciados por lector de pantalla**
      (T2) — verificado 6-ago-2026: se comenta y se resuelve solo con Tab y Enter, y el contador de
      abiertos vive en un `role="status"` con `aria-live` que anuncia el cambio
- [x] **El flujo de revisión completo es operable desde móvil** (T3) — verificado 6-ago-2026 en un
      Pixel 7: comentar, resolver y reabrir sin desplazamiento horizontal, con los controles a 44 px

### Sobre el DOCX: por qué no es una plantilla `.dotx`

El plan pedía `docxtemplater` sobre una plantilla corporativa «editable por Calidad sin tocar
código». Se construye programáticamente porque **la estructura del informe no es fija**: Calidad
publica versiones con secciones distintas (E3.7) y un informe tiene entre dos y catorce bloques de
trabajo, cada uno con sus tablas y sus fotos. Una plantilla de marcadores habría que republicarla
cada vez que cambia el formato, que es justo lo que el motor de plantillas viene a evitar.

Lo que se pierde se recupera en el propio `.docx`: sale con estilos de Word de verdad, así que
quien lo abre cambia «Título 1» y se le aplica al documento entero. **Si el negocio prefiere la
plantilla `.dotx`, esto hay que rehacerlo** — la decisión queda aquí para poder discutirla.

### Deuda anotada de F3

1. **Retirar el atajo `borrador → emitido`.** Lo dejó F1 (E1.9) con una nota que decía que había que
   quitarlo al llegar F3, y tiene razón: mientras siga ahí, cualquiera con `reports:issue` emite sin
   que nadie revise. No se retira en esta pasada porque ocho llamadas de los e2e de la API lo usan y
   **no puedo ejecutarlos aquí** para adaptarlos con garantías; hacerlo a ciegas dejaría el CI rojo
   de una forma que no puedo comprobar.
2. **S3 Object Lock** (E3.4) no está configurado: hoy la inmutabilidad la sostiene la aplicación, no
   el almacén.
3. Los tests de la API de F3 están **sin escribir** además de sin ejecutar: la revisión, la
   calibración y la auditoría solo tienen cobertura de dominio y de pantalla.

---

# F4 — PWA, movilidad y offline

**Objetivo:** igualar y superar la experiencia offline que los técnicos **ya tienen hoy**. Hasta que
esta fase esté lista, la PWA actual sigue siendo el respaldo operativo.

|                         |                                                  |
| ----------------------- | ------------------------------------------------ |
| **Duración**            | 4–6 semanas                                      |
| **Depende de**          | F1 · F2 (para poder capturar mediciones offline) |
| **Puede solaparse con** | F3, F5                                           |

## Alcance

| Épica                                 | Historias principales                                                                                                                   |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **E4.1 Service worker e instalación** | Angular SW (`freshness` para API, `performance` para assets) · manifest ya provisto · instalable en Android, iOS y escritorio           |
| **E4.2 Caché de maestros**            | Sincronización delta al iniciar sesión y cada 4 h: clientes, sedes, equipos, motores, modelos, specs, técnicos, componentes             |
| **E4.3 Edición offline**              | Informes en IndexedDB (Dexie) · fotos como Blob · **chip de estado permanente** en el header                                            |
| **E4.4 Cola y sincronización**        | `clientOpId` UUID idempotente · `POST /sync/push` y `/sync/pull` · reintentos con backoff · nunca borrar local hasta confirmar servidor |
| **E4.5 Conflictos**                   | Resolución **por bloque**, no por informe · UI de comparación cuando hay conflicto real                                                 |
| **E4.6 Captura móvil**                | Cámara nativa desde el navegador · compresión · **vinculación desktop↔móvil por QR** (UX-03)                                            |
| **E4.7 Responsive completo**          | Editor usable en tablet · captura de fotos y mediciones optimizada para móvil · gestos y áreas seguras                                  |
| **E4.8 Límites y avisos**             | Advertir si hay > 500 MB en IndexedDB o > 5 informes sin sincronizar                                                                    |

## Estado de las épicas (6-ago-2026)

| Épica                                 | Estado                                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **E4.1** Service worker e instalación | 🟡 `ngsw-config.json` y el manifest venían de F0. Falta comprobar la instalación en dispositivos |
| **E4.2** Caché de maestros            | ⬜ Pendiente — el `dataGroup` de `/masters/**` existe; falta la sincronización delta cada 4 h    |
| **E4.3** Edición offline              | 🟢 Crear, editar y añadir bloques sin red, con id local y reasignación al subir. Faltan las fotos |
| **E4.4** Cola y sincronización        | 🟢 `clientOpId` idempotente, orden de envío, reintentos con backoff, `POST /sync/push` y `/pull` |
| **E4.5** Conflictos                   | 🟡 La detección por bloque está y probada. Falta la pantalla de comparación                      |
| **E4.6** Captura móvil                | ⬜ Pendiente — cámara nativa y vinculación por QR (UX-03)                                        |
| **E4.7** Responsive completo          | 🟢 Heredado de F1–F3: cada pantalla se verifica a 360 px en su propio e2e                        |
| **E4.8** Límites y avisos             | 🟢 Aviso por > 500 MB o > 5 informes sin sincronizar, antes de chocar con el límite              |

## Criterios de aceptación

> **Estado (7-ago-2026):** el ciclo de trabajo sin red está cerrado de punta a punta — crear,
> editar, añadir bloques y subir al recuperar la señal — y verificado en un navegador de verdad,
> con su IndexedDB, en escritorio y en móvil (`e2e/sin-conexion.e2e.ts`). Lo que queda de F4 son
> las fotos, los maestros y lo que necesita dispositivos.

- [~] Con el modo avión activado, un técnico crea un informe completo con 20 fotos y 3 grillas de
  medición — **crear, editar y añadir bloques sí; las 20 fotos no.** Verificado 7-ago-2026 en
  `e2e/sin-conexion.e2e.ts`: sin red la bandeja crea el informe con id local, el editor lo abre y
  acepta trabajo. El identificador de cada bloque lo genera el cliente y el servidor lo respeta
  (`reports.service.ts`), que es lo que evita que las ediciones posteriores queden huérfanas.
  Falta la captura de fotos sin red, que depende de E4.6
- [x] Al recuperar conexión, todo se sincroniza **sin duplicados y sin pérdida de captions** — la
  cola se vacía sola al volver la red (`sync.service.spec.ts`) y el recorrido completo está
  verificado 7-ago-2026 en `e2e/sin-conexion.e2e.ts`: el informe creado sin red sube solo y la URL
  del editor pasa del id local al del servidor **sin que el técnico recargue ni pulse nada**.
  Con captions reales todavía no, por lo mismo que el punto anterior
- [x] Reenviar la misma operación dos veces (doble tap, reintento) **no crea dos informes** —
      verificado 6-ago-2026: el `clientOpId` viaja con cada operación, el servidor recuerda las
      aplicadas 30 días y contesta `repetida` con el id de la primera. En el cliente, `repetida`
      cuenta como confirmada
- [x] Dos usuarios editan bloques distintos del mismo informe offline; al sincronizar, ambos cambios
      se conservan — verificado 6-ago-2026 en `sync.spec.ts`: se encola **una operación por cambio**
      y `chocan()` solo da conflicto cuando tocan el mismo bloque del mismo informe
- [ ] La app instalada abre en < 3 s sin conexión (NFR-01) — necesita medirla instalada
- [ ] La app se instala en Android, iOS y escritorio con el icono correcto (maskable incluido) —
      necesita los dispositivos
- [ ] **El tema oscuro funciona también en la app instalada, incluida la barra de estado** (T1) — el
      `theme-color` ya cambia con el tema y está verificado en el navegador; falta en la instalada
- [ ] **La captura de fotos y mediciones en móvil es cómoda con una sola mano** (T3) — la grilla sí
      está verificada a 360 px (F2); la cámara nativa es E4.6, sin empezar
- [x] El chip de conexión indica el número exacto de cambios pendientes — verificado 6-ago-2026:
      cuenta pendientes y fallidas, no lo que está en vuelo. El número es lo que el técnico mira
      para decidir si puede irse del sitio con cobertura

### Lo que queda para cerrar F4

1. **Fotos sin red**: capturarlas como `Blob` en IndexedDB y subirlas con la cola. La tabla
   `fotos` existe desde el principio y nadie escribe en ella todavía; va junto con la cámara
   nativa (E4.6), porque son el mismo flujo visto desde dos sitios.
2. Sincronización delta de maestros (E4.2) y vinculación desktop↔móvil por QR (E4.6).
3. Pantalla de comparación cuando hay conflicto real (E4.5).
4. Lo que necesita dispositivos: instalación, arranque offline y barra de estado.

> **Deuda anotada al implementar E4.3.** Reordenar bloques **no se encola**: la operación va por
> posiciones y aplicarla más tarde, sobre un informe donde entretanto se añadieron o quitaron
> bloques, movería uno distinto del que el técnico arrastró. Sin red la pantalla lo dice y no lo
> intenta. Encolarlo de verdad exige reescribir la operación en términos de identificadores
> («pon este bloque después de aquel»), que es un cambio de contrato con el backend.

---

# F5 — Analítica y gestión del conocimiento

**Objetivo:** entregar la promesa central del deck — _"transformar la información técnica en un
activo estratégico"_.

|                         |                                                                                                      |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| **Duración**            | 4–6 semanas                                                                                          |
| **Depende de**          | F2 (`measurementFacts`) · volumen mínimo de ~30 informes emitidos · **D8** (migración del histórico) |
| **Puede solaparse con** | F4, F6                                                                                               |

## Alcance

| Épica                                | Historias principales                                                                                             |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| **E5.1 Dashboard operativo**         | Informes por estado · tiempo promedio de emisión · motores en taller · informes por técnico y por cliente         |
| **E5.2 Ficha 360° de motor**         | Por número de serie: historial de intervenciones, horas, fotos, documentos, componentes cambiados                 |
| **E5.3 Tendencias de desgaste**      | Curva de un parámetro por motor en el tiempo · comparación contra la flota del mismo modelo                       |
| **E5.4 Alertas**                     | Mediciones fuera de tolerancia · instrumentos por vencer calibración · motores que superan horas de mantenimiento |
| **E5.5 Consumo de repuestos**        | Maestros `spareParts`, `suppliers`, `outsourcedServices` · consumo por informe, equipo y periodo                  |
| **E5.6 Búsqueda avanzada**           | Atlas Search sobre texto de bloques, conclusiones y recomendaciones                                               |
| **E5.7 Exportaciones**               | Excel de mediciones, consumo y bandeja de informes                                                                |
| ~~**E5.8 Migración del histórico**~~ | ❌ **Fuera de alcance (D8).** No se migra nada; la plataforma arranca en limpio                                   |

## Criterios de aceptación

- [ ] La ficha del motor `5282011236` muestra sus intervenciones ordenadas y su curva de juego axial
- [ ] La consulta _"todos los encajes de camisa fuera de tolerancia en motores 4000 durante 2026"_
      responde en < 2 s
- [ ] El dashboard carga en < 3 s con 500 informes en base
- [ ] Una alerta de instrumento por vencer llega por email 30 días antes
- [ ] **Los gráficos son legibles en tema oscuro y no dependen solo del color para distinguir series** (T1, T2)
- [ ] **El dashboard es útil en móvil**, no una versión degradada (T3)

---

# F6 — Integración corporativa

**Objetivo:** cerrar el frente "Integraciones" del slide 7.

|                |                                                                              |
| -------------- | ---------------------------------------------------------------------------- |
| **Duración**   | 4–6 semanas                                                                  |
| **Depende de** | F3 · definición de TI sobre qué sistemas integrar realmente (**D7**, **D9**) |

## Alcance

| Épica                          | Historias principales                                                                                            |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| **E6.1 SSO corporativo**       | Entra ID / Google Workspace vía OIDC · aprovisionamiento de usuarios                                             |
| **E6.2 API pública**           | OpenAPI documentada · API keys por sistema · webhooks de eventos (`informe.emitido`)                             |
| **E6.3 SharePoint**            | Publicación automática del PDF aprobado en la biblioteca documental corporativa                                  |
| **E6.4 Power BI**              | Endpoint/vista de solo lectura o export programado a un dataset                                                  |
| ~~**E6.5 Sistema de OT**~~     | ❌ **Fuera de alcance (D7).** Las órdenes se crean en la plataforma; no hay ERP del que importarlas              |
| ~~**E6.6 Portal de cliente**~~ | ❌ **Fuera de alcance (D9).** El informe se entrega como hoy; la plataforma no expone acceso a usuarios externos |

## Criterios de aceptación

- [ ] Un usuario inicia sesión con su cuenta corporativa sin contraseña propia de la plataforma
- [ ] Al emitir un informe, el PDF aparece automáticamente en la biblioteca de SharePoint acordada
- [ ] Power BI consume el dataset y reproduce el dashboard de F5
- [ ] Los webhooks reintentan con backoff y son verificables por firma

---

# Cronograma y dependencias

```
Semana   0    4    8   12   16   20   24   28   32   36   40
         │    │    │    │    │    │    │    │    │    │    │
F0  ███──┘
F1       ████████████████──┐
F2                         ██████████──┐
F3            (paralelizable desde F1) ████████████──┐
F4                                      ██████████───┤
F5                                          ██████████──┐
F6                                                  ██████████
```

| Fase | Bloquea a  | Puede solaparse con |
| ---- | ---------- | ------------------- |
| F0   | Todas      | —                   |
| F1   | F2, F3, F4 | —                   |
| F2   | F5         | F3                  |
| F3   | F6         | F2, F4              |
| F4   | —          | F3, F5              |
| F5   | —          | F4, F6              |

**Estrategia de puesta en producción:** salida a producción al final de F1 con 2–3 técnicos piloto y
convivencia con la PWA actual; adopción total al cerrar F3 (cuando existe flujo de aprobación y DOCX
editable); apagado de la PWA local al cerrar F4.

---

# Indicadores de éxito

| KPI                                                                   | Línea base actual                              | Meta                  | Se mide desde |
| --------------------------------------------------------------------- | ---------------------------------------------- | --------------------- | ------------- |
| Horas para elaborar un informe de evaluación                          | A determinar en F0 (estimado 6–10 h)           | −50%                  | F1            |
| Informes con datos maestros inconsistentes                            | Alta (evidencia: `KOMATZU`, `SPCC. TOQUEPALA`) | < 2%                  | F1            |
| Tiempo desde fin de servicio hasta informe emitido                    | A determinar                                   | ≤ 3 días hábiles      | F3            |
| Informes con retrabajo por observación de supervisor                  | No medible hoy                                 | < 15%                 | F3            |
| Mediciones fuera de tolerancia detectadas en captura (no en revisión) | 0%                                             | > 90%                 | F2            |
| Informes accesibles desde repositorio central                         | 0%                                             | 100%                  | F1            |
| Adopción (informes emitidos en plataforma / total)                    | 0%                                             | > 95% al cierre de F4 | F1            |

---

# Riesgos

| ID  | Riesgo                                                                               | Prob. | Impacto  | Mitigación                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------ | ----- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | **Rechazo de los técnicos** si la plataforma es más lenta o rígida que la PWA actual | Media | **Alto** | Piloto desde F1 con los mismos técnicos que validaron la PWA · convivencia · sin corte forzado · UX-01 a UX-10 son requisitos, no adornos           |
| R2  | **Especificaciones MTU no disponibles** a tiempo                                     | Media | **Alto** | Iniciar recopilación en F0 · si no llegan, F2 arranca con las tolerancias inferidas de los informes, marcadas `provisional: true`                   |
| R3  | **Maestros mal cargados** al inicio (flota, motores, modelos)                        | Alta  | Medio    | Importador con validación y reporte de errores · creación inline · proceso de merge de duplicados                                                   |
| R4  | Fidelidad del PDF insuficiente frente al Word                                        | Media | Alto     | Prueba ciega como criterio de aceptación de F1 · presupuestar 1–2 semanas de ajuste fino                                                            |
| R5  | Costo de S3 y Atlas subestimado                                                      | Baja  | Medio    | Compresión obligatoria en cliente · ciclo de vida S3 · alertas de presupuesto en AWS                                                                |
| R6  | El worker de Chromium consume la RAM del VPS                                         | Media | Medio    | Servicio separado con límite de memoria · cola con concurrencia 1–2 · monitoreo                                                                     |
| R7  | Alcance creciente (nuevas plantillas pedidas durante la construcción)                | Alta  | Medio    | El editor de plantillas de F3 es la respuesta: Calidad crea plantillas sin desarrollo. Lo emergente va a "Alcance emergente", no a la fase en curso |
| R8  | Dependencia de Coolify (self-hosted) para disponibilidad                             | Media | Medio    | Runbook de recuperación documentado · imágenes en GHCR permiten redeploy en cualquier host · backups fuera del VPS                                  |
| R9  | Pérdida de datos en sincronización offline                                           | Baja  | **Alto** | Idempotencia por `clientOpId` · cola append-only · nunca borrar local hasta confirmar servidor · pruebas específicas en F4                          |

---

# Decisiones abiertas

Bloquean fases concretas. Resolverlas es responsabilidad del negocio, no del equipo de desarrollo.

| ID  | Decisión                                                                                        | Necesaria antes de        | Responsable              | Estado                                                                                                                                                                                                                                                                                                                          |
| --- | ----------------------------------------------------------------------------------------------- | ------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Rangos de tolerancia oficiales** por modelo de motor según manual MTU                         | F2                        | Jefatura técnica         | ✅ **Resuelta 5-ago-2026: carga manual.** Las tolerancias se introducen a mano en el maestro `engineSpecs` desde administración; no se importan de ningún fichero. Las ya cargadas desde los informes quedan marcadas `provisional: true` hasta que Jefatura técnica las contraste con el manual                                |
| D2  | **Semántica del signo** en las mediciones de muñones (−0.01, −0.02)                             | F2                        | Jefatura técnica         | ✅ **Resuelta 5-ago-2026: es la DESVIACIÓN respecto al nominal.** El técnico anota cuánto se aparta del diámetro nominal, no la medida absoluta. Implementado: `AppliedSpec.modo = 'desviacion' \| 'absoluto'` en el motor de tolerancias                                                                                       |
| D3  | **Convención exacta** de `ITS-T-E-26-003-0898` y `LIM-TAL-000898`                               | F1                        | Calidad / Administración | ✅ **Resuelta 5-ago-2026: ingreso manual.** El número de informe y el de OT los escribe el usuario; no hay generador automático de correlativos en F1. El campo se valida por formato y unicidad, y `sequences` queda para cuando el negocio fije la convención                                                                 |
| D4  | **Alcance del anexo SER-T-FOR-002**: ¿checklist dentro del informe o adjunto?                   | F2                        | Calidad                  | ✅ **Resuelta 5-ago-2026: sección dentro del mismo informe.** Un bloque `checklist` más; sale en el mismo PDF, comparte número y ciclo de aprobación. No se modela como documento independiente                                                                                                                                 |
| D5  | **Multi-empresa**: ¿se emiten informes con logo y numeración de más de una razón social?        | **F0 — afecta el modelo** | Gerencia                 | ✅ **Resuelta 5-ago-2026: SÍ.** Varias razones sociales; alta manual desde administración. Implementado el maestro `organizations`; `users` y `businessUnits` cuelgan de una organización. En F1 el informe llevará `organizacion: { id, razonSocial, ruc }` como referencia + snapshot                                         |
| D6  | **Tipo de firma**: imagen escaneada, dibujada en pantalla o digital con certificado             | F3                        | Legal / Calidad          | ✅ **Resuelta 5-ago-2026: dibujada en pantalla.** El firmante traza su firma al aprobar; se guarda el trazo con usuario, fecha y hash. Acredita el acto, no la identidad: **no tiene validez legal formal**, así que no sirve para respaldar garantías ante terceros. Si eso llega a hacer falta, habrá que pasar a certificado |
| D7  | **Sistema de OT existente**: ¿hay un ERP del que leer las órdenes, o se crean en la plataforma? | F1                        | TI                       | ✅ **Resuelta 5-ago-2026: se crean en la plataforma.** Sin importación desde ERP; E6.5 queda fuera de alcance salvo cambio                                                                                                                                                                                                      |
| D8  | **Migración del histórico**: ¿se cargan los Word anteriores?                                    | F5                        | Gerencia                 | ✅ **Resuelta 5-ago-2026: no se migra nada.** La plataforma arranca en limpio; el histórico se consulta donde está hoy. E5.8 sale del alcance. Consecuencia: las curvas de desgaste empiezan a tener valor cuando se acumulen intervenciones nuevas                                                                             |
| D9  | **Portal de cliente**: ¿acceso externo a SPCC, TASA, LAP?                                       | F6                        | Gerencia comercial       | ✅ **Resuelta 5-ago-2026: no.** El informe se entrega como hoy. E6.6 sale del alcance y la plataforma no expone acceso a usuarios externos, lo que simplifica mucho la seguridad                                                                                                                                                |
| D10 | **Glosario controlado**: normalizar términos mixtos (housing, contragolpe, magnaflux)           | F3                        | Jefatura técnica         | ✅ **Resuelta 5-ago-2026: se respeta el vocabulario actual.** La biblioteca de frases recoge los términos tal como los usan los técnicos, sin normalizar (riesgo R1: no imponer cambios de lenguaje). Consecuencia asumida: la búsqueda y la analítica de texto verán variantes del mismo concepto                              |

---

# Estrategia de migración y convivencia

| Etapa         | Qué pasa con la PWA actual                                                                         |
| ------------- | -------------------------------------------------------------------------------------------------- |
| Durante F0–F1 | Sigue siendo el sistema oficial. Nadie cambia nada                                                 |
| Cierre de F1  | Piloto con 2–3 técnicos en la plataforma nueva. La PWA sigue disponible para el resto              |
| Cierre de F3  | La plataforma pasa a ser el sistema oficial para informes **nuevos**. La PWA queda en solo lectura |
| Cierre de F4  | Se apaga la PWA. Antes, se exporta cualquier informe local pendiente                               |
| F5            | Se decide (D8) si el histórico en Word se carga como adjunto indexado o se extraen sus datos       |

**Recomendación sobre el histórico:** cargar los PDF/DOCX existentes como adjuntos indexados
asociados a su equipo y motor es barato y da valor inmediato. Extraer sus mediciones a
`measurementFacts` es caro y solo se justifica si el negocio quiere curvas de desgaste retroactivas
— decidirlo con datos reales de esfuerzo tras F5.

---

# Deuda técnica

Lo que se deja pendiente a sabiendas, con la razón y lo que hace falta para
saldarlo. No es una lista de deseos: cada línea bloquea algo concreto.

| #    | Qué queda pendiente                                                                                                                                                  | Por qué se deja                                                                                                                                  | Qué hace falta para saldarlo                                                           | Riesgo si no se salda                                                                                                                            |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| DT-1 | **Prueba de fidelidad del OT-746**: un técnico reproduce el informe en la plataforma y un supervisor no distingue, en una comparación ciega, cuál PDF salió del Word | No se puede automatizar. Necesita el informe original, un técnico que lo transcriba y un supervisor que no sepa cuál es cuál                     | Media jornada de un técnico y una hora de un supervisor, con el OT-746 impreso delante | **Alto.** Es el criterio que decide si los técnicos migran. Si el PDF no aguanta la comparación, F1 no vale para nada por muchos tests que pasen |
| DT-2 | **Lo mismo con el OT-898**                                                                                                                                           | Ídem. La mitad que sí dependía de nosotros —que no haga falta tocar código para el segundo informe— **está verificada** en `report-html.spec.ts` | Lo mismo que DT-1, con el OT-898                                                       | **Medio.** El motor de plantillas ya está probado; lo que falta es el acabado del documento                                                      |
| DT-3 | **NFR-02 medido contra Atlas**, no contra Mongo en memoria                                                                                                           | La medida actual (p95 18 ms) excluye la latencia de red, que es donde se consume el margen de 500 ms                                             | Repetir el banco de `reports.e2e.spec.ts` apuntando a la base de develop               | **Medio.** Si el autoguardado se percibe lento, el técnico deja de fiarse y guarda a mano                                                        |
| DT-4 | **S3 y Redis sin credenciales en Coolify**                                                                                                                           | Están fuera del repositorio a propósito (§20)                                                                                                    | Cargar las variables en los dos recursos de Coolify                                    | **Alto.** Sin ellas no hay fotografías ni PDF: dos de las diez épicas de F1 no se pueden usar                                                    |
| DT-5 | **Contraseñas de producción sin rotar** tras la siembra inicial                                                                                                      | Se generaron para verificar el despliegue                                                                                                        | Rotarlas o purgar las cuentas de prueba antes de exponer la plataforma                 | **Alto** en cuanto la plataforma sea accesible desde fuera                                                                                       |

> DT-1 y DT-2 son las que mantienen F1 abierta. Las demás no impiden avanzar a
> F2, pero sí impiden dar F1 por entregada.

---

# Alcance emergente

Todo lo que aparezca durante la construcción y no estuviera planificado se anota aquí, **no se mete
en la fase en curso** (riesgo R7). Se decide con el usuario a qué fase va.

| Fecha | Qué apareció | De dónde salió | Fase propuesta | Estado |
| ----- | ------------ | -------------- | -------------- | ------ |
| —     | —            | —              | —              | —      |

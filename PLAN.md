# Plan de implementación por fases

**Producto:** Plataforma corporativa de informes técnicos — Detroit Power System Perú
**Alcance:** Fase 4 del deck corporativo (F0–F6 de este plan)
**Duración estimada:** 32–42 semanas (8–10 meses)

Este plan operacionaliza `especificacionplataformainformestecnicos.md` (el *qué*) e incorpora los
requisitos obligatorios de `especificaciones.md` (el *cómo*). El sistema de diseño normativo está
en `.claude/DESIGN-SYSTEM.md`.

---

## Estado actual

| Fase | Estado | Semanas | Cierre |
|---|---|---|---|
| **F0** Fundaciones | 🟡 En curso — base entregada, falta bootstrap | 2–3 | — |
| **F1** Núcleo de informes (MVP) | ⬜ Pendiente | 7–9 | — |
| **F2** Mediciones dimensionales | ⬜ Pendiente | 4–6 | — |
| **F3** Aprobación y gobierno del formato | ⬜ Pendiente | 5–7 | — |
| **F4** PWA, movilidad y offline | ⬜ Pendiente | 4–6 | — |
| **F5** Analítica y conocimiento | ⬜ Pendiente | 4–6 | — |
| **F6** Integración corporativa | ⬜ Pendiente | 4–6 | — |

> Actualiza esta tabla al abrir y cerrar cada fase (skill `/dps-fase`).

---

## Cómo leer este plan

El deck usa "Fase 1–4" para la **evolución histórica**. Para evitar confusión, las fases de
construcción se numeran **F0–F6**, y todas ocurren *dentro* de la Fase 4 del deck.

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

| Supuesto | Valor |
|---|---|
| Equipo | 1 tech lead full-stack · 1 dev Angular · 1 dev NestJS · PO del negocio a medio tiempo · QA a medio tiempo |
| Semana | 5 días hábiles, capacidad efectiva 80% |
| Diseño UI | Se aplica el kit "Industrial Precision" ya provisto; no hay diseño desde cero |
| Contenido de maestros | Lo provee el negocio en Excel; el equipo construye el importador, no digita datos |
| Especificaciones MTU | Disponibles antes del inicio de F2 (**bloqueante** — riesgo R2) |
| Los rangos son órdenes de magnitud | ±25%, a refinar tras F0 |

---

## Requisitos transversales — aplican a TODAS las fases

Vienen de `especificaciones.md` y son de cumplimiento obligatorio en cada entregable, no una fase aparte.

| # | Requisito | Cómo se verifica en cada fase |
|---|---|---|
| T1 | **Tema claro/oscuro** automático según navegador + switch en el header | Toda pantalla nueva se revisa en ambos temas; sin destello al cargar |
| T2 | **UX y accesibilidad de formularios**: campos validables, errores que previenen fallos | Checklist de §7.2 y §9 de `DESIGN-SYSTEM.md` en cada PR con formularios |
| T3 | **Mobile first; en móvil se comporta como app** | Toda pantalla usable a 360 px con nav inferior y áreas seguras |
| T4 | **Monorepo con CI por ruta**: frontend solo si cambia frontend, backend solo si cambia backend | El resumen del workflow muestra qué se ejecutó |
| T5 | **Coolify con dos recursos**: `develop` → develop, `main` → producción | Prueba de despliegue en ambas ramas |
| T6 | **Skills y agents de Claude Code** para mantener buenas prácticas | Los agentes se usan en la revisión de cada fase |

---

# F0 — Fundaciones

**Objetivo:** que exista un esqueleto desplegado, con pipeline funcionando, antes de escribir una
sola pantalla de negocio.

| | |
|---|---|
| **Duración** | 2–3 semanas |
| **Depende de** | Acceso al VPS, cuenta AWS, cuenta Atlas, dominio corporativo |
| **Bloquea a** | Todas |

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

| Épica | Historias |
|---|---|
| **E0.1 Bootstrap de apps** | Generar `web`/`api`/`worker` con sus CLIs siguiendo `scripts/bootstrap.md` · enlazar `@dps/shared` · `npm run dev` levanta las tres |
| **E0.2 Infraestructura** | VPS con Coolify · Atlas en 3 entornos · buckets S3 con ciclo de vida · dominios + SSL · secrets y variables en GitHub |
| **E0.3 Shell de la app** | Layout responsive: sidebar desktop / nav inferior móvil · routing con lazy loading · header con buscador, estado de conexión, switch de tema y avatar · pantallas de error 403/404/500 |
| **E0.4 Auth base** | Login · JWT access + refresh rotativo en cookie httpOnly · Argon2id · guard de rutas · los 4 roles del slide 8 con permisos declarativos · pantalla de login con la marca |
| **E0.5 Observabilidad** | Pino estructurado · Sentry en las tres apps · `/api/v1/health` con Terminus (Mongo, Redis, S3) |
| **E0.6 Fuentes y assets** | `node scripts/fetch-fonts.mjs` · verificar que la app arranca sin red externa |
| **E0.7 Decisiones abiertas** | Resolver **D5 multi-empresa** (afecta el modelo) e iniciar la recopilación de las especificaciones MTU para D1 |

## Criterios de aceptación

- [ ] Un `git push` a `develop` despliega automáticamente a develop en < 10 min
- [ ] Un `git push` a `main` despliega a producción tras la aprobación manual
- [ ] Un cambio **solo** en `apps/web` no ejecuta ni reconstruye `api` ni `worker` (T4)
- [ ] Un cambio **solo** en `apps/api` no ejecuta ni reconstruye `web` (T4)
- [ ] `https://dev.tallerdetroit.tecdidata.com` responde con SSL válido y la app carga
- [ ] Un usuario `admin` inicia sesión; un usuario sin rol recibe 403 en una ruta protegida
- [ ] `/api/docs` muestra el OpenAPI generado
- [ ] Rollback probado: redesplegar el tag anterior restaura la versión previa
- [ ] **La app respeta `prefers-color-scheme` y el switch del header lo sobrescribe y persiste, sin destello** (T1)
- [ ] **El shell es usable a 360 px con barra inferior y áreas seguras respetadas** (T3)
- [ ] La app carga completa sin acceso a CDNs externos (fuentes e iconos autoalojados)
- [ ] `.env` y `.env.deploy` no están en el índice de git

## Entregables

Esqueleto desplegado en develop · pipeline verde · `infra/COOLIFY.md` aplicado · runbook de rollback.

---

# F1 — Núcleo de informes (MVP operativo)

**Objetivo:** que un técnico produzca, de punta a punta y en la plataforma central, un informe
**equivalente al que hoy produce en Word**.

> Esta es la fase que define el éxito del proyecto. Si el PDF que sale de aquí no es tan bueno como
> el Word actual, los técnicos no migran.

| | |
|---|---|
| **Duración** | 7–9 semanas |
| **Depende de** | F0 · maestros base cargados en Excel por el negocio · decisión **D3** (convención de correlativos) |
| **Bloquea a** | F2, F3, F4 |

## Alcance

| Épica | Historias principales |
|---|---|
| **E1.1 Maestros base** | Módulo `MastersModule` genérico (CRUD, paginación, búsqueda, auditoría) · maestros 1, 2, 3, 6, 7, 8, 10, 12, 13, 14, 31, 32, 33 · **creación inline** desde el formulario · búsqueda difusa tolerante a typos · importador CSV/XLSX con reporte de errores · merge de duplicados |
| **E1.2 Motor de plantillas (runtime)** | Modelo `templateVersions` con secciones y bloques embebidos · semilla de SER-FOR-002 v01 · renderizado del formulario desde la definición · visibilidad condicional declarativa |
| **E1.3 Órdenes de trabajo** | CRUD mínimo de OT · relación OT ↔ informes (1..n) |
| **E1.4 Correlativos** | `sequences` con asignación atómica · patrones `ITS-…` y `LIM-…` · sin colisiones bajo concurrencia |
| **E1.5 Editor de informes** | Wizard de 6 pasos · cascada Cliente→Sede→Equipo→Motor con autocompletado · **autoguardado cada 20–30 s** con indicador · bloques `work_task` ordenables por drag & drop **con alternativa por teclado** · `rich_text` · `bullet_list` · `items_table` · duplicar informe anterior (UX-05) |
| **E1.6 Evidencia fotográfica** | Subida directa a S3 con URL prefirmada · **compresión en cliente** (máx. 1600 px, JPEG q80) · caption obligatorio · numeración `Fig.NN` automática y recalculada al reordenar · derivados thumb/web/print en el worker |
| **E1.7 Generación de PDF** | Render servidor con Playwright · réplica fiel de la cabecera SER-FOR-002 · tablas de datos generales y de equipo · bloques con fotos en pares · reglas de paginación (mantener juntos título+párrafo, foto+caption, tabla completa) |
| **E1.8 Bandeja e historial** | Listado con filtros (estado, cliente, equipo, motor, técnico, fecha) · búsqueda · descarga · vista móvil como lista de cards |
| **E1.9 Estados básicos** | `borrador` → `emitido` (el flujo de revisión completo llega en F3) |
| **E1.10 Vista previa** | Panel lateral WYSIWYG idéntico al PDF (UX-06) |

## Criterios de aceptación

- [ ] **Prueba de fidelidad:** un técnico reproduce íntegramente el informe **OT746** en la plataforma;
      en una comparación ciega, un supervisor no identifica cuál PDF salió del Word y cuál de la plataforma
- [ ] Lo mismo con el informe **OT898**, **sin cambiar código** — solo componiendo bloques distintos
- [ ] Un informe con 45 fotos genera su PDF en < 45 s (NFR-03)
- [ ] El número de informe se asigna sin colisiones con 5 usuarios creando borradores simultáneamente (RN-01)
- [ ] Al reordenar bloques, la numeración de figuras se recalcula correctamente en pantalla y en el PDF (RN-06)
- [ ] Un técnico crea un equipo nuevo desde el formulario **sin perder el borrador en curso** (§13.3.1)
- [ ] El documento del informe en Mongo pesa < 1 MB con 45 fotos
- [ ] Buscar `KOMATZU` sugiere `KOMATSU` (§13.3.2)
- [ ] El autoguardado se percibe en < 500 ms y muestra "Guardado hace X" (NFR-02, UX-01)
- [ ] **Enviar con errores muestra una lista de campos faltantes navegables por clic**, no un alert (UX-07, T2)
- [ ] **Todo el wizard se completa solo con teclado**, incluido el reordenamiento de bloques (T2)
- [ ] **El editor es usable en móvil a 360 px** (T3)
- [ ] Cobertura backend ≥ 70%, frontend ≥ 50% (NFR-11)

## Entregables

Plataforma en staging usable por 2–3 técnicos piloto · manual breve de usuario · maestros base cargados.

**Hito de valor mínimo (semana ~11): aquí la plataforma ya reemplaza al Word.**

---

# F2 — Mediciones dimensionales

**Objetivo:** digitalizar la información que hoy no existe como dato, y con ello justificar toda la
inversión posterior en analítica.

| | |
|---|---|
| **Duración** | 4–6 semanas |
| **Depende de** | F1 · **especificaciones y tolerancias validadas contra el manual MTU (bloqueante, D1)** · **D2** (semántica del signo en muñones) |
| **Bloquea a** | F5 |

> **El hallazgo que gobierna la fase:** el número de columnas de cada grilla y sus tolerancias se
> derivan del modelo de motor. Al seleccionar el motor por su número de serie, la plataforma ya sabe
> que debe pedir 11 apoyos y validar contra 193.000 mm.

## Alcance

| Épica | Historias principales |
|---|---|
| **E2.1 Maestros técnicos** | `engineModels` con cilindros/apoyos/bancos/CAC/turbos · `engineSpecs` con índice único · `engineComponents` · `units` · `componentVerdicts` |
| **E2.2 Plantillas de medición** | Las 10 plantillas de §12.3 · resolución de dimensiones desde el modelo · campos calculados |
| **E2.3 Grilla de captura** | Componente con navegación por teclado, pegado desde Excel, semáforo en vivo, etiquetas fijas (`APOYO`, `L`, `T`), encabezados sticky |
| **E2.4 Validación** | Motor de tolerancias en backend (fuente de verdad) y espejo en frontend · denormalización de la especificación aplicada |
| **E2.5 Veredicto y conclusiones asistidas** | Propuesta automática de veredicto por bloque · pre-poblado de Conclusiones · biblioteca de frases |
| **E2.6 Render de mediciones** | Tablas dimensionales en PDF y DOCX con el formato del Word original · anexo "hoja de mediciones" independiente |
| **E2.7 Checklist de desarmado** | Bloque `checklist` para el anexo SER-T-FOR-002 (según **D4**) |
| **E2.8 Hechos analíticos** | Escritura de `measurementFacts` al emitir, con sus tres índices |

> El motor de tolerancias (`evaluateMeasurement`, `resolveColumns`, `proposeVerdict`) ya está
> implementado y probado en `libs/shared/src/domain/measurements.ts`. E2.4 lo integra; no lo reescribe.

## Criterios de aceptación

- [ ] Al seleccionar el motor `5282011236`, la grilla de muñón de bancada aparece con **11 columnas**
      y la de biela A con **10**, sin configuración manual
- [ ] Al seleccionar `5272012973` (16V), las mismas grillas aparecen con **9** y **8** columnas
- [ ] La grilla de encaje de camisa inferior valida contra **193.000 mm** para el 20V4000C23 y contra
      **189.000 mm** para el 16V4000C21
- [ ] Un valor de +0.16 mm en encaje superior se marca 🔴 y bloquea la emisión sin justificación del
      supervisor (RN-03)
- [ ] La `Ovalidad` se calcula y no es editable
- [ ] Un técnico captura las 11 columnas × 3 filas del túnel de bancada **usando solo el teclado, en < 60 s**
- [ ] `Ctrl+V` pega un rango copiado desde Excel y lo distribuye correctamente
- [ ] Las tablas del PDF generado son visualmente equivalentes a las del OT898
- [ ] **El semáforo se distingue sin depender del color**: icono + `aria-label` textual (T2, WCAG 1.4.1)
- [ ] Cada medición guarda `nominal`, `tolInf` y `tolSup` vigentes al momento de la captura
- [ ] Las specs cargadas desde los informes están marcadas `provisional: true` mientras D1 siga abierta
- [ ] **La grilla es usable en tablet y móvil** con scroll y encabezados fijos (T3)

---

# F3 — Flujo de aprobación, documentos y gobierno del formato

**Objetivo:** cerrar el ciclo de control interno que hoy no existe (slide 4: *"no existe
trazabilidad corporativa"*).

| | |
|---|---|
| **Duración** | 5–7 semanas |
| **Depende de** | F1 (F2 recomendable pero no bloqueante) · **D6** (tipo de firma) · **D10** (glosario controlado) |
| **Bloquea a** | F6 |
| **Puede solaparse con** | F2, F4 |

## Alcance

| Épica | Historias principales |
|---|---|
| **E3.1 Máquina de estados completa** | Las 7 transiciones de §14.2 con permisos por rol (ya definidas en `libs/shared`) |
| **E3.2 Revisión colaborativa** | Comentarios anclados a bloque · marcar resuelto · notificación al técnico (UX-08) |
| **E3.3 Firmas** | Bloque `signature_block` · firma con usuario + fecha + hash · imagen de firma desde `technicians` |
| **E3.4 Inmutabilidad y versiones** | Snapshot al emitir · hash SHA-256 · S3 Object Lock · versión correctiva que referencia a la anterior (RN-02, RN-08) |
| **E3.5 Export DOCX real** | `docxtemplater` sobre plantilla `.dotx` corporativa, editable por Calidad sin tocar código |
| **E3.6 Marca de agua y QR** | "BORRADOR" mientras no esté aprobado · QR de verificación en el pie · vista pública de verificación |
| **E3.7 Editor de plantillas (Calidad)** | UI para componer secciones y bloques · versionar y publicar · rol Calidad |
| **E3.8 Auditoría** | `auditLogs` append-only con TTL de 7 años · consulta filtrable para Administrador |
| **E3.9 Notificaciones** | Email en: enviado a revisión, observado, aprobado, emitido |
| **E3.10 Maestros restantes** | `instruments` con control de calibración (RN-04) · `testTypes` · `phraseLibrary` · `outputLayouts` · `settings` · `serviceReasons` · `checklists` |
| **E3.11 Roles adicionales** | `calidad` y `planificacion` como roles opcionales |

## Criterios de aceptación

- [ ] Un informe recorre `borrador → en_revision → observado → en_revision → aprobado → emitido`
      con los roles correctos y queda registrado en auditoría
- [ ] Un supervisor no puede aprobar sin resolver los comentarios abiertos
- [ ] Reimprimir un informe emitido devuelve un archivo con **el mismo hash** que la primera generación
- [ ] El `.docx` exportado abre en Word sin advertencias y es editable con estilos correctos
- [ ] Calidad publica SER-FOR-002 **v02** agregando una sección, y los informes emitidos con v01 se
      siguen renderizando idénticos (RN-08)
- [ ] Un informe que usa un instrumento con calibración vencida muestra advertencia bloqueante (RN-04)
- [ ] Escanear el QR de un PDF abre la vista de verificación con los datos del informe
- [ ] La consulta de auditoría filtra por actor, entidad, acción y rango de fechas
- [ ] **Los comentarios de revisión son navegables por teclado y anunciados por lector de pantalla** (T2)
- [ ] **El flujo de revisión completo es operable desde móvil** (T3)

---

# F4 — PWA, movilidad y offline

**Objetivo:** igualar y superar la experiencia offline que los técnicos **ya tienen hoy**. Hasta que
esta fase esté lista, la PWA actual sigue siendo el respaldo operativo.

| | |
|---|---|
| **Duración** | 4–6 semanas |
| **Depende de** | F1 · F2 (para poder capturar mediciones offline) |
| **Puede solaparse con** | F3, F5 |

## Alcance

| Épica | Historias principales |
|---|---|
| **E4.1 Service worker e instalación** | Angular SW (`freshness` para API, `performance` para assets) · manifest ya provisto · instalable en Android, iOS y escritorio |
| **E4.2 Caché de maestros** | Sincronización delta al iniciar sesión y cada 4 h: clientes, sedes, equipos, motores, modelos, specs, técnicos, componentes |
| **E4.3 Edición offline** | Informes en IndexedDB (Dexie) · fotos como Blob · **chip de estado permanente** en el header |
| **E4.4 Cola y sincronización** | `clientOpId` UUID idempotente · `POST /sync/push` y `/sync/pull` · reintentos con backoff · nunca borrar local hasta confirmar servidor |
| **E4.5 Conflictos** | Resolución **por bloque**, no por informe · UI de comparación cuando hay conflicto real |
| **E4.6 Captura móvil** | Cámara nativa desde el navegador · compresión · **vinculación desktop↔móvil por QR** (UX-03) |
| **E4.7 Responsive completo** | Editor usable en tablet · captura de fotos y mediciones optimizada para móvil · gestos y áreas seguras |
| **E4.8 Límites y avisos** | Advertir si hay > 500 MB en IndexedDB o > 5 informes sin sincronizar |

## Criterios de aceptación

- [ ] Con el modo avión activado, un técnico crea un informe completo con 20 fotos y 3 grillas de medición
- [ ] Al recuperar conexión, todo se sincroniza **sin duplicados y sin pérdida de captions**
- [ ] Reenviar la misma operación dos veces (doble tap, reintento) **no crea dos informes**
- [ ] Dos usuarios editan bloques distintos del mismo informe offline; al sincronizar, ambos cambios se conservan
- [ ] La app instalada abre en < 3 s sin conexión (NFR-01)
- [ ] La app se instala en Android, iOS y escritorio con el icono correcto (maskable incluido)
- [ ] **El tema oscuro funciona también en la app instalada, incluida la barra de estado** (T1)
- [ ] **La captura de fotos y mediciones en móvil es cómoda con una sola mano** (T3)
- [ ] El chip de conexión indica el número exacto de cambios pendientes

---

# F5 — Analítica y gestión del conocimiento

**Objetivo:** entregar la promesa central del deck — *"transformar la información técnica en un
activo estratégico"*.

| | |
|---|---|
| **Duración** | 4–6 semanas |
| **Depende de** | F2 (`measurementFacts`) · volumen mínimo de ~30 informes emitidos · **D8** (migración del histórico) |
| **Puede solaparse con** | F4, F6 |

## Alcance

| Épica | Historias principales |
|---|---|
| **E5.1 Dashboard operativo** | Informes por estado · tiempo promedio de emisión · motores en taller · informes por técnico y por cliente |
| **E5.2 Ficha 360° de motor** | Por número de serie: historial de intervenciones, horas, fotos, documentos, componentes cambiados |
| **E5.3 Tendencias de desgaste** | Curva de un parámetro por motor en el tiempo · comparación contra la flota del mismo modelo |
| **E5.4 Alertas** | Mediciones fuera de tolerancia · instrumentos por vencer calibración · motores que superan horas de mantenimiento |
| **E5.5 Consumo de repuestos** | Maestros `spareParts`, `suppliers`, `outsourcedServices` · consumo por informe, equipo y periodo |
| **E5.6 Búsqueda avanzada** | Atlas Search sobre texto de bloques, conclusiones y recomendaciones |
| **E5.7 Exportaciones** | Excel de mediciones, consumo y bandeja de informes |
| **E5.8 Migración del histórico** | Según D8: carga de PDF/DOCX existentes como adjuntos indexados asociados a su equipo y motor |

## Criterios de aceptación

- [ ] La ficha del motor `5282011236` muestra sus intervenciones ordenadas y su curva de juego axial
- [ ] La consulta *"todos los encajes de camisa fuera de tolerancia en motores 4000 durante 2026"*
      responde en < 2 s
- [ ] El dashboard carga en < 3 s con 500 informes en base
- [ ] Una alerta de instrumento por vencer llega por email 30 días antes
- [ ] **Los gráficos son legibles en tema oscuro y no dependen solo del color para distinguir series** (T1, T2)
- [ ] **El dashboard es útil en móvil**, no una versión degradada (T3)

---

# F6 — Integración corporativa

**Objetivo:** cerrar el frente "Integraciones" del slide 7.

| | |
|---|---|
| **Duración** | 4–6 semanas |
| **Depende de** | F3 · definición de TI sobre qué sistemas integrar realmente (**D7**, **D9**) |

## Alcance

| Épica | Historias principales |
|---|---|
| **E6.1 SSO corporativo** | Entra ID / Google Workspace vía OIDC · aprovisionamiento de usuarios |
| **E6.2 API pública** | OpenAPI documentada · API keys por sistema · webhooks de eventos (`informe.emitido`) |
| **E6.3 SharePoint** | Publicación automática del PDF aprobado en la biblioteca documental corporativa |
| **E6.4 Power BI** | Endpoint/vista de solo lectura o export programado a un dataset |
| **E6.5 Sistema de OT** | Importación de órdenes de trabajo desde el sistema corporativo (si existe — D7) |
| **E6.6 Portal de cliente** *(opcional, D9)* | Acceso restringido para que SPCC, TASA o LAP descarguen los informes aprobados de sus equipos |

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

| Fase | Bloquea a | Puede solaparse con |
|---|---|---|
| F0 | Todas | — |
| F1 | F2, F3, F4 | — |
| F2 | F5 | F3 |
| F3 | F6 | F2, F4 |
| F4 | — | F3, F5 |
| F5 | — | F4, F6 |

**Estrategia de puesta en producción:** salida a producción al final de F1 con 2–3 técnicos piloto y
convivencia con la PWA actual; adopción total al cerrar F3 (cuando existe flujo de aprobación y DOCX
editable); apagado de la PWA local al cerrar F4.

---

# Indicadores de éxito

| KPI | Línea base actual | Meta | Se mide desde |
|---|---|---|---|
| Horas para elaborar un informe de evaluación | A determinar en F0 (estimado 6–10 h) | −50% | F1 |
| Informes con datos maestros inconsistentes | Alta (evidencia: `KOMATZU`, `SPCC. TOQUEPALA`) | < 2% | F1 |
| Tiempo desde fin de servicio hasta informe emitido | A determinar | ≤ 3 días hábiles | F3 |
| Informes con retrabajo por observación de supervisor | No medible hoy | < 15% | F3 |
| Mediciones fuera de tolerancia detectadas en captura (no en revisión) | 0% | > 90% | F2 |
| Informes accesibles desde repositorio central | 0% | 100% | F1 |
| Adopción (informes emitidos en plataforma / total) | 0% | > 95% al cierre de F4 | F1 |

---

# Riesgos

| ID | Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|---|
| R1 | **Rechazo de los técnicos** si la plataforma es más lenta o rígida que la PWA actual | Media | **Alto** | Piloto desde F1 con los mismos técnicos que validaron la PWA · convivencia · sin corte forzado · UX-01 a UX-10 son requisitos, no adornos |
| R2 | **Especificaciones MTU no disponibles** a tiempo | Media | **Alto** | Iniciar recopilación en F0 · si no llegan, F2 arranca con las tolerancias inferidas de los informes, marcadas `provisional: true` |
| R3 | **Maestros mal cargados** al inicio (flota, motores, modelos) | Alta | Medio | Importador con validación y reporte de errores · creación inline · proceso de merge de duplicados |
| R4 | Fidelidad del PDF insuficiente frente al Word | Media | Alto | Prueba ciega como criterio de aceptación de F1 · presupuestar 1–2 semanas de ajuste fino |
| R5 | Costo de S3 y Atlas subestimado | Baja | Medio | Compresión obligatoria en cliente · ciclo de vida S3 · alertas de presupuesto en AWS |
| R6 | El worker de Chromium consume la RAM del VPS | Media | Medio | Servicio separado con límite de memoria · cola con concurrencia 1–2 · monitoreo |
| R7 | Alcance creciente (nuevas plantillas pedidas durante la construcción) | Alta | Medio | El editor de plantillas de F3 es la respuesta: Calidad crea plantillas sin desarrollo. Lo emergente va a "Alcance emergente", no a la fase en curso |
| R8 | Dependencia de Coolify (self-hosted) para disponibilidad | Media | Medio | Runbook de recuperación documentado · imágenes en GHCR permiten redeploy en cualquier host · backups fuera del VPS |
| R9 | Pérdida de datos en sincronización offline | Baja | **Alto** | Idempotencia por `clientOpId` · cola append-only · nunca borrar local hasta confirmar servidor · pruebas específicas en F4 |

---

# Decisiones abiertas

Bloquean fases concretas. Resolverlas es responsabilidad del negocio, no del equipo de desarrollo.

| ID | Decisión | Necesaria antes de | Responsable | Estado |
|---|---|---|---|---|
| D1 | **Rangos de tolerancia oficiales** por modelo según manual MTU (juego axial, muñones, coaxialidad, piñones) | F2 | Jefatura técnica | ⬜ Abierta |
| D2 | **Semántica del signo** en muñones (−0.01, −0.02): ¿desviación, submedida o clase de rectificado? | F2 | Jefatura técnica | ⬜ Abierta |
| D3 | **Convención exacta** de `ITS-T-E-26-003-0898` y `LIM-TAL-000898`: qué significa cada segmento y quién asigna | F1 | Calidad / Administración | ⬜ Abierta |
| D4 | **Alcance del anexo SER-T-FOR-002**: ¿checklist dentro del informe o adjunto? | F2 | Calidad | ⬜ Abierta |
| D5 | **Multi-empresa**: ¿se emiten informes con logo y numeración de más de una razón social? | **F0 — afecta el modelo** | Gerencia | ⬜ Abierta |
| D6 | **Tipo de firma**: imagen escaneada, dibujada en pantalla o digital con certificado | F3 | Legal / Calidad | ⬜ Abierta |
| D7 | **Sistema de OT existente**: ¿hay un ERP del que leer las órdenes, o se crean en la plataforma? | F1 | TI | ⬜ Abierta |
| D8 | **Migración del histórico**: ¿se cargan los Word anteriores? ¿Cuántos años? ¿Adjunto o con extracción? | F5 | Gerencia | ⬜ Abierta |
| D9 | **Portal de cliente**: ¿acceso externo a SPCC, TASA, LAP? | F6 | Gerencia comercial | ⬜ Abierta |
| D10 | **Glosario controlado**: normalizar términos mixtos (housing, contragolpe, magnaflux) | F3 | Jefatura técnica | ⬜ Abierta |

---

# Estrategia de migración y convivencia

| Etapa | Qué pasa con la PWA actual |
|---|---|
| Durante F0–F1 | Sigue siendo el sistema oficial. Nadie cambia nada |
| Cierre de F1 | Piloto con 2–3 técnicos en la plataforma nueva. La PWA sigue disponible para el resto |
| Cierre de F3 | La plataforma pasa a ser el sistema oficial para informes **nuevos**. La PWA queda en solo lectura |
| Cierre de F4 | Se apaga la PWA. Antes, se exporta cualquier informe local pendiente |
| F5 | Se decide (D8) si el histórico en Word se carga como adjunto indexado o se extraen sus datos |

**Recomendación sobre el histórico:** cargar los PDF/DOCX existentes como adjuntos indexados
asociados a su equipo y motor es barato y da valor inmediato. Extraer sus mediciones a
`measurementFacts` es caro y solo se justifica si el negocio quiere curvas de desgaste retroactivas
— decidirlo con datos reales de esfuerzo tras F5.

---

# Alcance emergente

Todo lo que aparezca durante la construcción y no estuviera planificado se anota aquí, **no se mete
en la fase en curso** (riesgo R7). Se decide con el usuario a qué fase va.

| Fecha | Qué apareció | De dónde salió | Fase propuesta | Estado |
|---|---|---|---|---|
| — | — | — | — | — |

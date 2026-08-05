# Plataforma de Informes Técnicos — Detroit Power System Perú

Monorepo de la **Fase 4** del Módulo de Informes Técnicos (MIT): evolución de una PWA local
validada en campo a una plataforma corporativa centralizada.

## Documentos de referencia (leer antes de decidir)

| Documento | Qué contiene | Cuándo consultarlo |
|---|---|---|
| `especificacionplataformainformestecnicos.md` | **Especificación funcional y técnica completa.** Alcance, 35 maestros, motor de plantillas, módulo de mediciones, modelo de datos, API, seguridad, NFRs | Fuente de verdad de *qué* se construye |
| `especificaciones.md` | **Requisitos transversales obligatorios del cliente** | Ver "No negociables" abajo |
| `PLAN.md` | Plan de construcción F0–F6 con épicas, historias y criterios de aceptación | Fuente de verdad de *en qué orden* |
| @.claude/DESIGN-SYSTEM.md | **Sistema de diseño normativo.** Tokens, tipografía, componentes, light/dark, accesibilidad | Antes de escribir cualquier CSS o componente |
| `analisisplataformainformestecnicos.md` | Análisis previo del prototipo y los informes reales | Contexto y trazabilidad |
| `Modulo IT.html` | Prototipo v6.0 en producción hoy | Referencia de comportamiento a preservar |

## No negociables (`especificaciones.md`)

1. **Tema claro/oscuro** automático según el navegador **y** con switch en el header.
2. **UX y accesibilidad de primer nivel en formularios**, con validación que prevenga errores. WCAG 2.1 AA.
3. **Mobile first**, y la versión móvil se comporta **como una app** (nav inferior, gestos, offline).
4. **Monorepo**, con CI/CD que ejecuta **solo el frontend cuando cambia el frontend** y **solo el backend cuando cambia el backend**.
5. **Coolify con dos recursos**: push a `develop` → despliegue a *develop*; push a `main` → despliegue a *producción*.
6. **Skills y agents de Claude Code** para que la implementación mantenga buenas prácticas de código y de UX/UI.

## Stack

Angular 22 (standalone, signals, `@if/@for`) · NestJS 11 · MongoDB Atlas · AWS S3 · Redis + BullMQ ·
Playwright (PDF) · docxtemplater (DOCX) · Tailwind · GitHub Actions · Coolify.

## Estructura

```
apps/web      Angular 22 PWA          (frontend)
apps/api      NestJS 11 REST + OpenAPI (backend)
apps/worker   NestJS + BullMQ + Chromium (render de documentos, derivados de imagen)
libs/shared   Tipos, DTOs, contratos y tokens compartidos entre web/api/worker
infra/        Dockerfiles, compose local, notas de Coolify
docs/         Documentación operativa y de decisiones
```

## Reglas de trabajo

### Diseño
- **Todo estilo sale de `.claude/DESIGN-SYSTEM.md`.** Cero hex literales en componentes; solo tokens.
- Ninguna pantalla se da por terminada sin verse en claro **y** oscuro, a 360 px y a 1920 px.
- Todo dato técnico (medidas, series, códigos, horas, N/P) va en **JetBrains Mono** con `tabular-nums`.

### Código
- TypeScript `strict`. Nada de `any` salvo con comentario justificando.
- Angular: componentes standalone, `ChangeDetectionStrategy.OnPush`, signals para estado local,
  NgRx SignalStore para el editor de informes. Sin `NgModule` nuevos.
- NestJS: un módulo por dominio (ver §15.3 de la especificación). `class-validator` en todos los DTOs.
  Los *guards* de RBAC se declaran con `@Permissions()`, nunca con `if (user.role === ...)` disperso.
- **El backend es la fuente de verdad de toda validación.** El frontend valida solo para dar
  retroalimentación inmediata; nunca es la única barrera.
- Nada de binarios en MongoDB: a S3 van las fotos y los documentos; en Mongo solo la clave y metadatos.
- Los correlativos se asignan con `findOneAndUpdate` + `$inc` atómico. Nunca leer-incrementar-escribir.
- Toda escritura relevante deja registro en `auditLogs` (append-only).

### Datos e informes
- Los maestros se referencian **por id + snapshot denormalizado**. Un informe emitido debe seguir
  diciendo lo que decía aunque el maestro cambie después.
- Al emitir se congela `templateSnapshot`; el render posterior nunca consulta la plantilla viva (RN-08).
- Las tolerancias aplicadas se denormalizan en cada medición: nominal, tolInf y tolSup vigentes
  al momento de la captura.

### Git
- Ramas: `main` (producción) · `develop` (integración) · `feat/*`, `fix/*`, `chore/*`.
- Commits convencionales (`feat(web): …`, `fix(api): …`). El scope indica la app afectada — de él
  dependen los filtros de ruta del CI.
- `main` protegida: PR con revisión obligatoria. Etiquetas semánticas para producción.

### Seguridad
- **Nunca** commitear secretos. `.env` y `.env.deploy` están en `.gitignore` y contienen credenciales reales.
- Los secretos de ejecución se gestionan en Coolify, no en el repositorio.

## Comandos

```bash
npm install                 # instala todo el workspace
npm run dev                 # api + worker + web en paralelo
npm run dev:web             # solo Angular
npm run dev:api             # solo NestJS
npm run lint                # eslint en todo el workspace
npm run test                # tests unitarios
npm run build               # build de las tres apps
```

## Skills y agents disponibles

| Nombre | Para qué |
|---|---|
| `/dps-ui` (skill) | Construir o revisar UI conforme al sistema de diseño |
| `/dps-api` (skill) | Crear un módulo de dominio NestJS con la estructura del proyecto |
| `/dps-master` (skill) | Dar de alta un maestro completo (backend + CRUD + UI) |
| `/dps-fase` (skill) | Abrir/cerrar una fase del `PLAN.md` con sus criterios de aceptación |
| `dps-design-reviewer` (agent) | Auditar una pantalla contra el sistema de diseño y WCAG AA |
| `dps-angular-dev` (agent) | Implementar features de frontend |
| `dps-nest-dev` (agent) | Implementar features de backend |
| `dps-measurements` (agent) | Trabajar sobre el módulo de mediciones dimensionales |
| `dps-qa` (agent) | Verificar criterios de aceptación de una fase |

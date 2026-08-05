# Coolify — configuración de los dos entornos

Requisito de `docs/especificaciones.md`:

> en coolify se debe crear 2 recursos, producción y develop. cuando se haga push a la rama
> develop, debe desplegarse automáticamente en develop, y cuando se haga push a main debe
> desplegarse automáticamente en production.

## Cómo se despliega

Coolify **construye cada app desde su Dockerfile** en este repositorio (repo público, sin
credenciales de registro). Quien decide **qué** se reconstruye es GitHub Actions
(`.github/workflows/deploy.yml`), mediante filtrado por ruta: si el push solo tocó el frontend, solo
se redespliega el frontend.

> El _auto deploy_ nativo de Coolify debe quedar **desactivado** en los seis recursos. Si se activa,
> cada push redespliega las tres apps y el filtrado por ruta deja de tener efecto. Como red de
> seguridad adicional, cada recurso tiene además su propio `watch_paths`.

## Estado actual

**Instancia:** `http://190.102.150.169:8000` · **Proyecto:** `detroit-informes`
**Servidor:** `qjutzeg6apmdlm9sytgbgvyo` (IP pública `190.102.150.169`, Traefik 3.6)

| Recurso                 | Entorno    | Dominio                                      | Puerto | RAM    |
| ----------------------- | ---------- | -------------------------------------------- | ------ | ------ |
| `dps-web-production`    | production | `https://tallerdetroit.tecdidata.com`        | 8080   | 512 MB |
| `dps-api-production`    | production | `https://tallerdetroitapi.tecdidata.com`     | 3000   | 1 GB   |
| `dps-worker-production` | production | — (solo consume colas)                       | 3001   | 2 GB   |
| `dps-web-develop`       | develop    | `https://dev-tallerdetroit.tecdidata.com`    | 8080   | 512 MB |
| `dps-api-develop`       | develop    | `https://dev-tallerdetroitapi.tecdidata.com` | 3000   | 1 GB   |
| `dps-worker-develop`    | develop    | — (solo consume colas)                       | 3001   | 2 GB   |
| `dps-redis-production`  | production | interno                                      | 6379   | —      |
| `dps-redis-develop`     | develop    | interno                                      | 6379   | —      |

Cada aplicación usa `build_pack: dockerfile`, contexto de build `/` (la raíz del repo, porque los
Dockerfiles copian `libs/shared` y `apps/*`) y su `dockerfile_location` correspondiente
(`/infra/web.Dockerfile`, `/infra/api.Dockerfile`, `/infra/worker.Dockerfile`).

## ⚠️ Esta máquina no puede alojar MongoDB

La CPU del VPS **no soporta AVX**, requisito de MongoDB ≥ 5. Comprobado en la práctica:
`mongo:7` entra en bucle de reinicio y solo `mongo:4.4` (fuera de soporte desde febrero de 2024)
llega a arrancar.

No es un problema, porque la especificación (§15.1) ya define **MongoDB Atlas** como la base de
datos de la plataforma en todos los entornos. Simplemente deja de ser una opción autoalojar Mongo
aquí. La conexión se configura en `MONGODB_URI`:

| Entorno    | Base de datos en el cluster |
| ---------- | --------------------------- |
| production | `dps-informes`              |
| develop    | `dps-informes-dev`          |

Antes de producción hay que añadir la IP `190.102.150.169` a la _IP Access List_ de Atlas (§20).

## DNS

Registros A en Cloudflare (zona `tecdidata.com`), **sin proxy** — Traefik necesita el reto HTTP-01
directo para emitir los certificados de Let's Encrypt:

| Nombre                               | Tipo | Valor             | Proxy |
| ------------------------------------ | ---- | ----------------- | ----- |
| `tallerdetroit.tecdidata.com`        | A    | `190.102.150.169` | no    |
| `tallerdetroitapi.tecdidata.com`     | A    | `190.102.150.169` | no    |
| `dev-tallerdetroit.tecdidata.com`    | A    | `190.102.150.169` | no    |
| `dev-tallerdetroitapi.tecdidata.com` | A    | `190.102.150.169` | no    |

## Secrets y variables de GitHub Actions

**Secrets del repositorio**

| Nombre          | Contenido                                         |
| --------------- | ------------------------------------------------- |
| `COOLIFY_URL`   | URL base de Coolify, sin barra final              |
| `COOLIFY_TOKEN` | Token de API de Coolify con permiso de despliegue |

**Secrets por entorno** (`develop` y `production` en _Settings → Environments_)

| Nombre                | Contenido                 |
| --------------------- | ------------------------- |
| `COOLIFY_UUID_web`    | UUID del recurso `web`    |
| `COOLIFY_UUID_api`    | UUID del recurso `api`    |
| `COOLIFY_UUID_worker` | UUID del recurso `worker` |

**Variables por entorno**

| Nombre         | develop                                      | production                               |
| -------------- | -------------------------------------------- | ---------------------------------------- |
| `BASE_URL_web` | `https://dev-tallerdetroit.tecdidata.com`    | `https://tallerdetroit.tecdidata.com`    |
| `BASE_URL_api` | `https://dev-tallerdetroitapi.tecdidata.com` | `https://tallerdetroitapi.tecdidata.com` |

El entorno `production` tiene **revisión manual obligatoria**: un push a `main` construye, pero no
despliega hasta que alguien aprueba.

## Variables de entorno de los recursos

Se configuran en Coolify, **nunca en el repositorio**. `apps/api/.env.example` documenta cada una.

### `api` y `worker`

```
NODE_ENV=production
PORT=3000                       # 3001 en el worker
LOG_LEVEL=info                  # debug en develop
MONGODB_URI=mongodb+srv://…     # Atlas
REDIS_URL=redis://<uuid-del-recurso-redis>:6379
JWT_ACCESS_SECRET=…             # ≥ 32 caracteres; la API no arranca si es menor
JWT_REFRESH_SECRET=…            # distinto del anterior
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d
PASSWORD_MIN_LENGTH=12
LOGIN_MAX_ATTEMPTS=5
LOGIN_LOCKOUT_MINUTES=15
CORS_ORIGINS=https://tallerdetroit.tecdidata.com
AWS_REGION=…
AWS_S3_BUCKET=…
AWS_ACCESS_KEY_ID=…
AWS_SECRET_ACCESS_KEY=…
S3_SIGNED_URL_TTL=900
EMAIL_PROVIDER=gmail            # gmail | smtp | none
USER_EMAIL=…                    # con gmail: contraseña de aplicación en PASSWORD_EMAIL
PASSWORD_EMAIL=…
MAIL_FROM="Informes Técnicos DPS <no-reply@detroitpower.pe>"
SENTRY_DSN=
```

> Dentro de la red de Coolify los servicios se resuelven por el **UUID del recurso**, no por su
> nombre visible. La API de Coolify devuelve la cadena correcta en `internal_db_url`.

### `web`

Angular resuelve la URL de la API en tiempo de build (`src/environments/`), así que el recurso solo
necesita `BUILD_ENV` (`develop` o `production`) como variable **de build**. En runtime nginx no lee
ninguna variable.

## Backups y recuperación

| Qué             | Cómo                                                                                         |
| --------------- | -------------------------------------------------------------------------------------------- |
| MongoDB         | Atlas continuous backup con PITR. RPO ≤ 1 h, RTO ≤ 4 h (NFR-05)                              |
| S3              | Versioning activado + réplica cross-region. Object Lock en el prefijo de documentos emitidos |
| Redis           | AOF; su pérdida solo implica reencolar trabajos, no pérdida de datos                         |
| Rollback de app | En Coolify, desplegar el commit anterior desde el historial del recurso                      |

## Ciclo de vida en S3

| Edad        | Clase                     |
| ----------- | ------------------------- |
| 0–12 meses  | S3 Standard               |
| 12–36 meses | S3 Infrequent Access      |
| > 36 meses  | Glacier Instant Retrieval |

Capacidad inicial recomendada: **100 GB** (≈ 6 años a 60 informes/mes). Ver §21.4.

## Comprobación

- [x] Push a `develop` con un cambio solo en `apps/web` → el CI ejecuta **solo** los jobs de frontend
- [x] Los dominios de frontend responden con SSL válido en ambos entornos
- [x] El fallback SPA funciona (una ruta profunda devuelve `index.html`)
- [ ] `/api/v1/health` responde 200 en los dos entornos
- [ ] La IP del VPS está en la _IP Access List_ de Atlas
- [ ] Rollback probado

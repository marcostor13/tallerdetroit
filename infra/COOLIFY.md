# Coolify — configuración de los dos entornos

Requisito de `especificaciones.md`:

> en coolify se debe crear 2 recursos, producción y develop. cuando se haga push a la rama
> develop, debe desplegarse automáticamente en develop, y cuando se haga push a main debe
> desplegarse automáticamente en production.

El despliegue lo dispara **GitHub Actions** (`.github/workflows/deploy.yml`) llamando al endpoint
`/api/v1/deploy` de Coolify. Se hace así, y no con el auto-deploy nativo de Coolify por webhook de
Git, porque el CI debe respetar el **filtrado por ruta**: si el push solo tocó el frontend, no tiene
sentido reconstruir y reiniciar la API y el worker.

> Desactiva el *auto deploy* nativo en cada recurso de Coolify. Si queda activo, cada push
> redespliega las tres apps y el filtrado por ruta deja de tener efecto.

## Proyectos y recursos

Crea **un proyecto** `detroit-informes` con **dos entornos**: `develop` y `production`.
Cada entorno tiene 4 recursos:

| Recurso | Imagen (GHCR) | CPU / RAM | Notas |
|---|---|---|---|
| `web` | `ghcr.io/<owner>/<repo>/web:<env>-latest` | 0.5 / 512 MB | nginx, puerto 8080 |
| `api` | `ghcr.io/<owner>/<repo>/api:<env>-latest` | 1 / 1 GB | 2 réplicas en producción, puerto 3000 |
| `worker` | `ghcr.io/<owner>/<repo>/worker:<env>-latest` | 1 / **2 GB** | Chromium; **límite de memoria obligatorio** |
| `redis` | `redis:7-alpine` | 0.5 / 512 MB | persistencia AOF |

**VPS de producción recomendado:** 4 vCPU / 8 GB RAM / 100 GB SSD.

## Dominios

| Entorno | Frontend | Backend |
|---|---|---|
| production | `tallerdetroit.tecdidata.com` | `tallerdetroitapi.tecdidata.com` |
| develop | `dev.tallerdetroit.tecdidata.com` | `devapi.tallerdetroit.tecdidata.com` |

SSL automático con Let's Encrypt gestionado por Traefik dentro de Coolify. Fuerza HTTPS y HSTS.

## Registro privado

Los tres recursos tiran imágenes de **GHCR**. En Coolify → *Sources* → añade un registro Docker:

- Registro: `ghcr.io`
- Usuario: el owner de GitHub
- Contraseña: un PAT con scope `read:packages`

## Secrets de GitHub Actions

En *Settings → Secrets and variables → Actions*:

**Secrets del repositorio**

| Nombre | Valor |
|---|---|
| `COOLIFY_URL` | URL base de Coolify, sin barra final |
| `COOLIFY_TOKEN` | Token de API de Coolify con permiso de despliegue |

**Secrets por entorno** (crea los *environments* `develop` y `production` en GitHub)

| Nombre | Valor |
|---|---|
| `COOLIFY_UUID_WEB_DEVELOP` / `_PRODUCTION` | UUID del recurso `web` de ese entorno |
| `COOLIFY_UUID_API_DEVELOP` / `_PRODUCTION` | UUID del recurso `api` |
| `COOLIFY_UUID_WORKER_DEVELOP` / `_PRODUCTION` | UUID del recurso `worker` |
| `MONGODB_URI` | Cadena de conexión de Atlas para las migraciones |

> El UUID de un recurso aparece en su URL dentro de Coolify.

**Variables por entorno**

| Nombre | Ejemplo |
|---|---|
| `BASE_URL_WEB` | `https://tallerdetroit.tecdidata.com` |
| `BASE_URL_API` | `https://tallerdetroitapi.tecdidata.com` |

Protege el entorno `production` con **revisión manual obligatoria** (*Required reviewers*).

## Variables de entorno de los recursos

Se configuran en Coolify, **nunca en el repositorio**.

### `api` y `worker`

```
NODE_ENV=production
PORT=3000                       # 3001 en el worker
MONGODB_URI=mongodb+srv://…
REDIS_URL=redis://redis:6379
JWT_ACCESS_SECRET=…             # ≥ 64 caracteres aleatorios
JWT_REFRESH_SECRET=…            # distinto del anterior
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d
AWS_REGION=us-east-1
AWS_S3_BUCKET=dps-informes-prod
AWS_ACCESS_KEY_ID=…
AWS_SECRET_ACCESS_KEY=…
S3_SIGNED_URL_TTL=900
CORS_ORIGINS=https://tallerdetroit.tecdidata.com
SENTRY_DSN=…
SMTP_URL=…
LOG_LEVEL=info
```

### `web`

Angular compila las variables en el build, así que el entorno se pasa como `build-arg`
(`BUILD_ENV`) y se resuelve contra `apps/web/src/environments/`. En runtime nginx no necesita nada.

## Backups y recuperación

| Qué | Cómo |
|---|---|
| MongoDB | Atlas continuous backup con PITR. RPO ≤ 1 h, RTO ≤ 4 h (NFR-05) |
| S3 | Versioning activado + réplica cross-region. Object Lock en el prefijo de documentos emitidos |
| Redis | AOF; su pérdida solo implica reencolar trabajos, no pérdida de datos |
| Rollback de app | Redesplegar en Coolify el tag anterior — las imágenes quedan en GHCR |

## Ciclo de vida en S3

| Edad | Clase |
|---|---|
| 0–12 meses | S3 Standard |
| 12–36 meses | S3 Infrequent Access |
| > 36 meses | Glacier Instant Retrieval |

Capacidad inicial recomendada: **100 GB** (≈ 6 años a 60 informes/mes). Ver §21.4.

## Comprobación tras configurar

- [ ] Push a `develop` con un cambio solo en `apps/web` → se redespliega **solo** `web` de develop
- [ ] Push a `develop` con un cambio solo en `apps/api` → se redespliega **solo** `api` de develop
- [ ] Push a `main` → despliega a producción tras la aprobación manual
- [ ] Ambos dominios responden con SSL válido
- [ ] `/api/v1/health` responde 200 en los dos entornos
- [ ] Rollback probado: redesplegar el tag anterior restaura la versión previa
- [ ] El auto-deploy nativo de Coolify está **desactivado** en los 6 recursos de app

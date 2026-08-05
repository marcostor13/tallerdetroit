# Bootstrap del monorepo — primer paso de F0

Este repositorio ya contiene la **configuración específica del proyecto**: tokens de diseño,
servicio de tema, contratos compartidos, CI/CD, Dockerfiles y activos de marca. Lo que falta es
generar el esqueleto de las tres aplicaciones con sus CLIs oficiales, para no reescribir a mano lo
que Angular y Nest generan mejor.

Ejecuta los pasos **en orden**. Cada uno indica qué se conserva de lo ya existente.

## 1. Frontend — Angular 22

```bash
cd apps
npx @angular/cli@latest new web \
  --directory=web \
  --style=css \
  --ssr=false \
  --routing \
  --package-manager=npm \
  --skip-git \
  --skip-install \
  --prefix=dps
```

> El generador preguntará si sobrescribe archivos existentes: **conserva** `src/index.html`,
> `src/styles.css`, `src/styles/`, `src/app/core/`, `src/app/shared/`, `public/` y
> `tailwind.config.js`.

Después:

```bash
cd web
npm pkg set name="@dps/web"
npx ng add @angular/pwa --skip-confirmation      # service worker + manifest
npm i -D tailwindcss@^3 postcss autoprefixer @tailwindcss/forms
npm i @ngrx/signals dexie
npx ng add @angular/material --skip-confirmation # opcional: decidir en F0 (§15.1)
```

Ajustes obligatorios tras generar:

- `angular.json`: `"assets"` debe incluir `public/` con `"output": "/"` para que los favicons,
  el manifest y los iconos queden en la raíz del build.
- `ngsw-config.json`: estrategia `freshness` para `/api/**` y `performance` para assets (§18).
- Borra el `manifest.webmanifest` que genera `@angular/pwa`: **ya existe uno completo** en
  `public/manifest.webmanifest` con los shortcuts y los iconos maskable.
- Descarga las fuentes con `node scripts/fetch-fonts.mjs` (autoalojadas: la PWA debe abrir offline).

## 2. Backend — NestJS 11

```bash
cd apps
npx @nestjs/cli@latest new api --package-manager npm --skip-git --skip-install --strict
cd api
npm pkg set name="@dps/api"
npm i @nestjs/config @nestjs/mongoose mongoose @nestjs/swagger \
      @nestjs/jwt @nestjs/passport passport passport-jwt \
      @nestjs/throttler @nestjs/terminus \
      class-validator class-transformer \
      argon2 nestjs-pino pino-http \
      @aws-sdk/client-s3 @aws-sdk/s3-request-presigner \
      bullmq @nestjs/bullmq \
      @sentry/node
npm i -D mongodb-memory-server migrate-mongo @types/passport-jwt
```

Crea los módulos de dominio de §15.3:

```bash
for m in auth users masters work-orders templates reports measurements media \
         documents sequences sync analytics audit notifications integrations; do
  npx nest g module "$m" --no-spec
done
```

## 3. Worker

```bash
cd apps
npx @nestjs/cli@latest new worker --package-manager npm --skip-git --skip-install --strict
cd worker
npm pkg set name="@dps/worker"
npm i @nestjs/config bullmq @nestjs/bullmq playwright docxtemplater pizzip \
      sharp @aws-sdk/client-s3 nestjs-pino
```

## 4. Enlazar la librería compartida

En `apps/web/tsconfig.json` y `apps/api/tsconfig.json` añade:

```json
{
  "compilerOptions": {
    "paths": {
      "@dps/shared": ["../../libs/shared/src/index.ts"],
      "@dps/shared/*": ["../../libs/shared/src/*"]
    }
  }
}
```

## 5. Instalar y verificar

```bash
cd ../..            # raíz del monorepo
npm install         # resuelve los workspaces
npm run docker:up   # mongo + redis + minio + mailpit
npm run dev
```

Verificación:

- `http://localhost:4200` carga y el switch de tema funciona en los tres estados
- `http://localhost:3000/api/v1/health` responde 200
- `http://localhost:3000/api/docs` muestra el OpenAPI
- `http://localhost:8025` muestra la bandeja de Mailpit
- `npm run test -w @dps/shared` pasa (motor de tolerancias)

## 6. Git y despliegue

```bash
git init && git branch -M main
git add -A && git commit -m "chore(infra): fundaciones del monorepo"
git checkout -b develop
```

Antes del primer push, comprueba que **`.env` no está en el índice**:

```bash
git status --short | grep -E '^\S+\s+\.env' && echo "PELIGRO: .env indexado" || echo "OK"
```

Luego sigue `infra/COOLIFY.md` para crear los recursos y configurar los secrets.

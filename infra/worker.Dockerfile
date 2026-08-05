# syntax=docker/dockerfile:1.7
# Worker de render documental: NestJS + BullMQ + Chromium (Playwright).
#
# Va en un servicio SEPARADO de la API a propósito: cada render de PDF consume
# 300–600 MB de RAM, y dentro de la API un informe de 60 fotos tumbaría el
# servicio para todos los usuarios (§15.2, riesgo R6).

# ---------- build ----------
FROM node:22-bookworm-slim AS build
WORKDIR /app

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package.json package-lock.json ./
COPY libs/shared/package.json libs/shared/
COPY apps/worker/package.json apps/worker/
RUN npm ci --workspace @dps/shared --workspace @dps/worker --include-workspace-root

COPY tsconfig.base.json ./
COPY libs/shared libs/shared
RUN npm run build -w @dps/shared

COPY apps/worker apps/worker
RUN npm run build -w @dps/worker

# ---------- deps de producción ----------
FROM node:22-bookworm-slim AS deps
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
COPY libs/shared/package.json libs/shared/
COPY apps/worker/package.json apps/worker/
RUN npm ci --omit=dev --workspace @dps/shared --workspace @dps/worker --include-workspace-root \
  && npm cache clean --force

# ---------- runtime ----------
# La imagen oficial de Playwright ya trae Chromium y todas sus dependencias
# de sistema, incluidas las fuentes necesarias para renderizar el informe.
FROM mcr.microsoft.com/playwright:v1.49.0-noble AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3001 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Fuentes corporativas para que el PDF sea idéntico a la vista previa.
COPY apps/web/public/fonts/ /usr/share/fonts/truetype/dps/
RUN fc-cache -f >/dev/null 2>&1 || true

COPY --from=deps  --chown=pwuser:pwuser /app/node_modules             ./node_modules
COPY --from=build --chown=pwuser:pwuser /app/libs/shared/dist         ./libs/shared/dist
COPY --from=build --chown=pwuser:pwuser /app/libs/shared/package.json ./libs/shared/package.json
COPY --from=build --chown=pwuser:pwuser /app/apps/worker/dist         ./apps/worker/dist
COPY --from=build --chown=pwuser:pwuser /app/apps/worker/package.json ./apps/worker/package.json

USER pwuser
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/worker/dist/main.js"]

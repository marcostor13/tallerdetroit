# syntax=docker/dockerfile:1.7
# Backend NestJS 11.

# ---------- build ----------
FROM node:22-alpine AS build
WORKDIR /app

# Coolify inyecta NODE_ENV=production; con ese valor npm salta las
# devDependencies y el build se queda sin tsc ni nest.
ENV NODE_ENV=development

COPY package.json package-lock.json ./
COPY libs/shared/package.json libs/shared/
COPY apps/api/package.json apps/api/
RUN npm ci --workspace @dps/shared --workspace @dps/api --include-workspace-root

COPY tsconfig.base.json ./
COPY libs/shared libs/shared
RUN npm run build -w @dps/shared

COPY apps/api apps/api
RUN npm run build -w @dps/api

# ---------- deps de producción ----------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY libs/shared/package.json libs/shared/
COPY apps/api/package.json apps/api/
RUN npm ci --omit=dev --workspace @dps/shared --workspace @dps/api --include-workspace-root \
  && npm cache clean --force

# ---------- runtime ----------
FROM node:22-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache tini curl \
  && addgroup -g 1001 -S nodejs \
  && adduser -u 1001 -S nestjs -G nodejs

ENV NODE_ENV=production \
    PORT=3000

COPY --from=deps  --chown=nestjs:nodejs /app/node_modules            ./node_modules
COPY --from=build --chown=nestjs:nodejs /app/libs/shared/dist        ./libs/shared/dist
COPY --from=build --chown=nestjs:nodejs /app/libs/shared/package.json ./libs/shared/package.json
COPY --from=build --chown=nestjs:nodejs /app/apps/api/dist           ./apps/api/dist
COPY --from=build --chown=nestjs:nodejs /app/apps/api/package.json   ./apps/api/package.json

USER nestjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:3000/api/v1/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/api/dist/main.js"]

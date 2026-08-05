# syntax=docker/dockerfile:1.7
# Frontend Angular 22 servido por nginx.

# ---------- build ----------
FROM node:22-alpine AS build
WORKDIR /app

ARG BUILD_ENV=production
ENV NODE_ENV=development

COPY package.json package-lock.json ./
COPY libs/shared/package.json libs/shared/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @dps/shared --workspace @dps/web --include-workspace-root

COPY tsconfig.base.json ./
COPY libs/shared libs/shared
RUN npm run build -w @dps/shared

COPY apps/web apps/web
RUN npm run build -w @dps/web -- --configuration=${BUILD_ENV}

# ---------- runtime ----------
FROM nginx:1.27-alpine AS runtime

RUN rm /etc/nginx/conf.d/default.conf
COPY infra/nginx.conf /etc/nginx/conf.d/app.conf
COPY --from=build /app/apps/web/dist/web/browser /usr/share/nginx/html

# nginx:alpine trae el usuario `nginx` (uid 101); no corre como root.
RUN chown -R nginx:nginx /usr/share/nginx/html \
  && touch /var/run/nginx.pid \
  && chown nginx:nginx /var/run/nginx.pid \
  && chown -R nginx:nginx /var/cache/nginx
USER nginx

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]

# Veltrix Community Edition — client (React/Vite) Dockerfile.
#
# Built from the REPO ROOT context (see docker-compose.yml:
# `build.context: .`, `build.dockerfile: client/Dockerfile`), not from
# `client/` itself — every COPY below is root-relative.

# ---- Stage 1: build ---------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies (native addons some transitive deps may need)
RUN apk add --no-cache python3 make g++

# Copy package manifests first for better layer caching
COPY client/package*.json ./

# `npm install` (not `npm ci`) because this is a pnpm workspace — there is no
# per-package package-lock.json, only the root pnpm-lock.yaml. This package has
# no `workspace:*` deps, so a self-contained install works.
RUN npm install --no-audit --no-fund

# The client tsconfig(.app).json `extends: "../tsconfig.base.json"`; WORKDIR is
# /app so that resolves to /tsconfig.base.json. Copy it in or vite/esbuild fails
# to resolve the extends chain during the build.
COPY tsconfig.base.json /tsconfig.base.json

# Copy the rest of the client source
COPY client/. .

# Optional build-time brand override (falls back to Community Edition
# defaults in src/brand.ts when unset). The primary rebrand path is the
# server-served GET /api/brand — see .env.example VELTRIX_BRAND_*.
ARG VITE_API_URL
ARG VITE_BRAND_NAME
ARG VITE_BRAND_TAGLINE
ARG VITE_BRAND_VENDOR
ARG VITE_BRAND_LOGO_URL
ENV VITE_API_URL=${VITE_API_URL} \
    VITE_BRAND_NAME=${VITE_BRAND_NAME} \
    VITE_BRAND_TAGLINE=${VITE_BRAND_TAGLINE} \
    VITE_BRAND_VENDOR=${VITE_BRAND_VENDOR} \
    VITE_BRAND_LOGO_URL=${VITE_BRAND_LOGO_URL}

# Skip the standalone `tsc -b` type-check on the production build path —
# this mirrors the source project's own `build-skip-ts` script and keeps a
# stray type error from blocking a container build; `pnpm -r build`/CI should
# still run the full `tsc -b && vite build` for type-checking.
RUN npm run build-skip-ts

# ---- Stage 2: runtime (nginx) -----------------------------------------------
FROM nginx:1.27-alpine

RUN apk add --no-cache dumb-init

RUN rm -rf /etc/nginx/conf.d/*

COPY client/nginx.conf /etc/nginx/nginx.conf
COPY --from=builder /app/dist /usr/share/nginx/html

RUN addgroup -g 101 -S nginx || true && \
    adduser -S -D -H -u 101 -h /var/cache/nginx -s /sbin/nologin -G nginx -g nginx nginx || true

RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    chmod -R 755 /usr/share/nginx/html

RUN mkdir -p /var/run/nginx && \
    chown -R nginx:nginx /var/run/nginx

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:80/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["nginx", "-g", "daemon off;"]

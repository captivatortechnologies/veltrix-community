# Multi-stage Dockerfile for the Veltrix Community Edition backend.
#
# Build context is the REPO ROOT (see docker-compose.yml:
# `build: { context: ., dockerfile: server/Dockerfile }`), not server/ —
# two things need to be reachable from outside server/:
#   1. `shared/` — cross-package TS types (pipeline/app/api contracts) that
#      core/pipeline-engine and core/app-engine reference by relative path.
#      Type-only, so it never needs to exist in the runtime image; it's
#      erased at compile time.
#   2. The workspace root files are NOT needed here: server/package.json
#      has no `workspace:*` dependencies, so a plain `npm ci` scoped to
#      server/ is sufficient — no pnpm-in-Docker complexity required.

# ---- Stage 1: dependencies + build ----
FROM node:20-alpine AS builder

WORKDIR /app

# Native module build deps (bcrypt, sharp)
RUN apk add --no-cache python3 make g++

# Install dependencies first (better layer caching)
COPY server/package*.json ./server/
COPY server/prisma ./server/prisma/
WORKDIR /app/server
RUN npm ci

# Copy source: server/ itself, plus the shared type-only package it
# references by relative path.
WORKDIR /app
COPY server/ ./server/
COPY shared/ ./shared/

WORKDIR /app/server

# Generate the Prisma client (needs the schema copied above)
RUN npx prisma generate

# Compile TypeScript -> dist/
RUN npm run build

# Drop dev dependencies from node_modules before it's copied into the
# runtime image
RUN npm prune --omit=dev

# ---- Stage 2: runtime ----
FROM node:20-alpine AS runtime

# dumb-init for correct signal handling (SIGTERM -> graceful shutdown)
RUN apk add --no-cache dumb-init

# Non-root runtime user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

ENV NODE_ENV=production \
    PORT=5000

COPY --from=builder --chown=nodejs:nodejs /app/server/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/server/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/server/prisma ./prisma
COPY --from=builder --chown=nodejs:nodejs /app/server/package.json ./

USER nodejs

EXPOSE 5000

# Matches the actual health route (`GET /` — see src/server.ts); there is
# no separate /health endpoint.
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:5000/', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)}).on('error', () => process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]

CMD ["node", "dist/server.js"]

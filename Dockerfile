# =============================================================================
# Dockerfile — Plataforma de Micro-Créditos (Next.js + Node 20)
# =============================================================================
# Multi-stage build:
#   1. deps    → Instala solo dependencias de producción (con lockfile)
#   2. builder → Compila la app, genera el output standalone
#   3. runner  → Imagen mínima de producción, solo lo necesario
# =============================================================================

# Stage 1: Dependencies (producción)
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Stage 2: Builder (compilación completa)
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 3: Runner (producción)
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Crear usuario no-root para seguridad
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copiar assets estáticos
COPY --from=builder /app/public ./public

# Copiar el output standalone de Next.js
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Asignar permisos al usuario no-root
RUN chown -R nextjs:nodejs /app

USER nextjs
EXPOSE 3000

ENV PORT=3000

# Healthcheck: verifica que el servidor responde
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

CMD ["node", "server.js"]

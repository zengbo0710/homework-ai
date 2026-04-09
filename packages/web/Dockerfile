# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY packages/web/package*.json ./packages/web/
COPY packages/shared/package*.json ./packages/shared/

RUN npm ci

COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/web ./packages/web

RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=packages/web

# ─── Stage 2: Output dist for nginx ──────────────────────────────────────────
FROM scratch
COPY --from=builder /app/packages/web/dist /dist

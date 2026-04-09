# M8/M9 — Docker & CI Spec

> Full design reference: [master spec §Section 2](./2026-04-09-m3-m9-ai-records-practice-reports-pwa-deploy-design.md#section-2-docker-setup)

## Goal

Containerize the full stack (API + Web + MySQL) for local prod-like testing, then prepare Coolify deployment config. Verify the complete app works in Chrome at `localhost:80` from Docker before any Coolify setup.

## What's Already Done

- `docker-compose.yml` — MySQL-only compose file for local API dev
- API listens on port 3001 in dev (`tsx watch`)
- Web served by Vite dev server on port 5173 with `/api` proxy

## Files Changed

| Action | Path | Purpose |
|--------|------|---------|
| Create | `packages/api/Dockerfile` | Multi-stage prod build for API |
| Create | `packages/api/Dockerfile.dev` | Dev image with tsx watch hot-reload |
| Create | `packages/web/Dockerfile` | Multi-stage build outputting static dist/ |
| Create | `packages/web/Dockerfile.dev` | Dev image with Vite --host 0.0.0.0 |
| Create | `docker-compose.dev.yml` | Hot-reload stack: mysql + api + web |
| Create | `docker-compose.prod.yml` | Prod-like stack: mysql + api + nginx + web-builder |
| Create | `nginx.conf` | Reverse proxy: /api/ → api:3001, /uploads/ → api:3001, / → static |
| Create | `.env.local.example` | Template for docker dev env vars |
| Create | `.env.prod.example` | Template for prod env vars |
| Modify | `docker-compose.yml` | Rename to keep as MySQL-only helper OR deprecate in favour of new files |
| Modify | `.github/workflows/ci.yml` | Add Docker build smoke-test step |

## Port Map

| Service | Dev port | Prod-like port |
|---------|----------|---------------|
| MySQL | 3306 | internal only |
| API | 3001 | internal only (nginx proxies) |
| Web (Vite dev) | 5173 | — |
| Nginx | — | 80 |

## API Port in Docker

The API must bind to `0.0.0.0:3001` inside the container (Fastify defaults to `127.0.0.1` — must pass `host: '0.0.0.0'` to `fastify.listen()`). Verify this in `packages/api/src/index.ts`.

## Key Decisions

- **Prod-like local test flow**: `docker-compose -f docker-compose.prod.yml up --build` → full app at `http://localhost` in Chrome. This is the acceptance gate before Coolify
- **Dev Docker flow**: `docker-compose -f docker-compose.dev.yml up` → hot-reload at `localhost:5173` (for developers who prefer Docker over bare npm)
- **Uploads volume**: API container mounts `./packages/api/uploads:/app/uploads` in dev; in prod-like, uploads are ephemeral (in-container) — Coolify will use a persistent volume
- **Migrations on startup**: API Dockerfile entrypoint runs `prisma migrate deploy` before `node dist/index.js`
- **Seed on first run**: Seed is NOT auto-run in prod Dockerfile; run manually via `docker exec` when needed
- **`.env.local`**: Dev compose uses `--env-file .env.local`; file is gitignored; `.env.local.example` committed
- **CI**: GitHub Actions adds a step `docker build -f packages/api/Dockerfile .` and `docker build -f packages/web/Dockerfile .` to catch build regressions; no full compose run in CI

## Coolify Notes (M9)

- Coolify deployment is out of scope for this codebase — configured via Coolify UI
- `docker-compose.prod.yml` serves as the reference architecture for Coolify service setup
- Persistent volume for uploads and MySQL data configured in Coolify dashboard
- SSL and domain handled by Coolify's built-in Traefik proxy

## Out of Scope

- Kubernetes / Helm
- Multi-region deployment
- CDN for static assets
- Automated DB backups (Coolify handles scheduled backups)

## Done Criteria

- [ ] `docker-compose -f docker-compose.prod.yml up --build` succeeds from cold start
- [ ] Full app loads at `http://localhost` in Chrome
- [ ] Register → login → add child → scan homework → see AI results — all work end-to-end in Docker
- [ ] `docker-compose -f docker-compose.dev.yml up` starts hot-reload dev environment
- [ ] API container binds on `0.0.0.0:3001` (confirmed via `docker logs`)
- [ ] GitHub Actions CI passes Docker build step on push to main
- [ ] `.env.local.example` and `.env.prod.example` committed with all required keys documented

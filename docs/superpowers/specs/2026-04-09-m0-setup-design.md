# HomeworkAI M0 — Setup & Scaffold Design

**Date:** 2026-04-09  
**Milestone:** M0 — Repo, local dev environment, PWA scaffold, DB schema, CI  
**Status:** Approved

---

## 1. Scope

M0 establishes the foundation everything else builds on:

- Monorepo structure (npm workspaces)
- Local Docker Compose dev environment (MySQL + API)
- React + Vite PWA scaffold with routing and base layout
- GitHub Actions CI (lint, typecheck, test)
- Full Prisma schema (MySQL) with initial migration and seed

No deployment to Coolify or any remote server in this milestone. All work is local.

---

## 2. Repo & Package Structure

```
homework-ai/
├── package.json                    ← npm workspaces: ["packages/*"]
├── tsconfig.base.json              ← shared TS settings extended by each package
├── .env.example                    ← root-level env template
├── docker-compose.yml              ← MySQL + API for local dev
├── .github/
│   └── workflows/ci.yml            ← lint + typecheck + test on push/PR
├── packages/
│   ├── shared/                     ← shared types & constants (no runtime deps)
│   │   ├── package.json
│   │   └── src/types/              ← ApiResponse, Subject enum, TokenPackage, etc.
│   ├── web/                        ← React 18 + Vite PWA
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   ├── public/manifest.json    ← PWA manifest
│   │   └── src/
│   └── api/                        ← Fastify + Prisma backend
│       ├── package.json
│       ├── prisma/
│       │   ├── schema.prisma
│       │   └── seed.ts
│       └── src/
```

### Key conventions

- Root `package.json` declares workspaces; scripts run via `npm run <script> --workspace=packages/<name>`
- Each package extends `tsconfig.base.json`
- `packages/web` and `packages/api` both list `@homework-ai/shared` as a local dependency
- `shared` is built to `dist/` before `web` and `api` start — root-level `build:shared` script handles this
- Package names: `@homework-ai/shared`, `@homework-ai/web`, `@homework-ai/api`

---

## 3. Local Dev Environment

### Docker Compose

```yaml
services:
  mysql:
    image: mysql:8.0
    ports: ["3306:3306"]
    environment:
      MYSQL_ROOT_PASSWORD: root
      MYSQL_DATABASE: homework_ai
      MYSQL_USER: app
      MYSQL_PASSWORD: app
    volumes:
      - mysql_data:/var/lib/mysql

  api:
    build: ./packages/api
    ports: ["3001:3001"]
    depends_on: [mysql]
    environment:
      DATABASE_URL: mysql://app:app@mysql:3306/homework_ai
      JWT_SECRET: dev-secret
    volumes:
      - ./packages/api:/app        # hot reload via tsx watch
      - /app/node_modules

volumes:
  mysql_data:
```

### Dev workflow

1. `docker compose up` — starts MySQL + API (with hot reload)
2. `npm run dev --workspace=packages/web` — starts Vite dev server on port 5173
3. `cd packages/api && npx prisma migrate dev` — applies migrations against local MySQL (run on host, not inside Docker)
4. `cd packages/api && npx prisma db seed` — seeds system_config defaults

Prisma CLI runs on the host machine and connects to MySQL via `localhost:3306`. The `packages/api/.env` file (gitignored) must contain `DATABASE_URL=mysql://app:app@localhost:3306/homework_ai` for this to work. The Docker Compose `api` service gets its `DATABASE_URL` directly from the `environment` block (using the `mysql` Docker hostname), so there is no conflict.

### Why frontend runs outside Docker

The `packages/web` Vite dev server runs directly on the host (not in Docker) to avoid bind-mount latency on macOS and get faster HMR. Vite proxies `/api/*` to `http://localhost:3001`.

### Environment variables

`.env.example` at repo root documents all required vars:
```
DATABASE_URL=mysql://app:app@localhost:3306/homework_ai
JWT_SECRET=dev-secret-change-in-prod
OPENAI_API_KEY=
GEMINI_API_KEY=
```

---

## 4. PWA Scaffold

### Dependencies

- `vite-plugin-pwa` — generates Workbox service worker
- `react-router-dom` v6 — client-side routing
- `tailwindcss` — mobile-first styling
- `@headlessui/react` — accessible UI primitives

### Caching strategy

- Cache-first: static assets (JS, CSS, fonts, images)
- Network-first: all `/api/*` requests
- Service worker disabled in dev mode (vite-plugin-pwa default)

### PWA manifest (`public/manifest.json`)

```json
{
  "name": "HomeworkAI",
  "short_name": "HomeworkAI",
  "display": "standalone",
  "start_url": "/",
  "background_color": "#ffffff",
  "theme_color": "#4f46e5",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

### Initial routes

| Path        | Component     | Notes                        |
|-------------|---------------|------------------------------|
| `/`         | —             | Redirects to `/login`        |
| `/login`    | `LoginPage`   | Stub form, wired in M1       |
| `/register` | `RegisterPage`| Stub form, wired in M1       |
| `/dashboard`| `DashboardPage`| Stub, implemented in M1     |

### AppShell

A single `AppShell` component wraps all authenticated routes:
- Top nav bar (app name + token balance placeholder)
- Bottom safe-area padding for iOS home indicator
- `<Outlet />` for nested routes

---

## 5. GitHub Actions CI

File: `.github/workflows/ci.yml`  
Trigger: push and pull_request to `main`

### Jobs (run in parallel)

**`lint-and-typecheck`**
1. `npm ci` (installs all workspaces from root)
2. `npm run build --workspace=packages/shared`
3. `npm run typecheck --workspace=packages/web`
4. `npm run typecheck --workspace=packages/api`
5. `npm run lint` (ESLint across all packages)

**`test`**
1. Start MySQL 8.0 via GitHub Actions service container
2. `npx prisma migrate deploy` (against test DB)
3. `npm test --workspace=packages/api` (Fastify integration tests)
4. `npm test --workspace=packages/web` (Vitest unit tests)

### Shared tooling (configured at root)

| Tool | Purpose |
|------|---------|
| ESLint | Linting — `@typescript-eslint` + `eslint-plugin-react` |
| Prettier | Formatting — checked in CI, not auto-fixed |
| Vitest | Unit and integration tests for both packages |

No deployment job in M0. Coolify integration is deferred.

---

## 6. Database Schema (MySQL + Prisma)

### MySQL vs PostgreSQL differences from tech design doc

| PostgreSQL (doc) | MySQL (this spec) |
|---|---|
| `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | `String @id @default(uuid())` |
| `JSONB` | `Json` |
| `UUID[]` arrays | Separate join table (`practice_session_sources`) |
| Custom `ENUM` type | Prisma `enum` → MySQL ENUM column |
| `TIMESTAMPTZ` | `DateTime @db.DateTime(0)` |

### Prisma datasource

```prisma
datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}
```

### Enums

```prisma
enum Subject {
  math
  english
  science
  chinese
  higher_chinese
}

enum SubmissionStatus {
  pending
  processing
  completed
  failed
}

enum TokenTransactionType {
  grant
  purchase
  deduct
  refund
}

enum WrongAnswerStatus {
  wrong
  partial_correct
}
```

### Core tables (all tables scaffolded in M0)

- `Parent` — email, password_hash, name, phone, locale
- `SystemConfig` — key/value store for admin-managed defaults
- `TokenBalance` — 1:1 with Parent; balance, total_earned, total_spent
- `TokenTransaction` — immutable audit log; type, amount, balance_after, reference
- `Child` — parent_id, name, grade (1–6), avatar_url
- `Submission` — child_id, detected_subject, image_count, status, ai_provider, retry_count
- `SubmissionImage` — submission_id, image_url, image_hash, sort_order
- `AiResponse` — submission_id, raw_response (Json), summary, counts, model_used, cost_usd, latency_ms
- `WrongAnswer` — submission_id, child_id, subject, question_number, image_order, question_text, child_answer, correct_answer, status, explanation, topic, difficulty, resolved_at
- `PracticeSession` — child_id, subject, source_type (active|resolved), multiplier, total_questions
- `PracticeSessionSource` — join table replacing UUID[] array: practice_session_id, wrong_answer_id
- `PracticeQuestion` — practice_session_id, question_text, answer, topic, difficulty, sort_order

### Seed (`prisma/seed.ts`)

Inserts `SystemConfig` defaults:
- `free_tokens_on_register` → `3`
- `token_packages` → JSON array (starter/standard/bulk)
- `tokens_per_submission` → `1`
- `tokens_per_practice` → `1`

### Migration

Initial migration `0001_init` creates all tables. Run via `npx prisma migrate dev --name init`.

---

## 7. Out of Scope for M0

- Authentication logic (M1)
- Any API routes beyond a health check `GET /api/health`
- Camera integration (M2)
- AI integration (M3)
- Coolify / remote deployment
- Token purchase flow (M1)

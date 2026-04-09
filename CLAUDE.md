# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**HomeworkAI** is a PWA for Singapore primary school parents to photograph their children's homework (P1–P6) and get AI-powered answer checking, wrong-answer tracking, and practice generation. It uses a token-based access model (1 token per AI request, 3 free on registration).

## Monorepo Structure

npm workspaces with three packages:

- **`packages/api`** — Fastify 4 + TypeScript backend, Prisma ORM, MySQL
- **`packages/web`** — React 18 + Vite + Tailwind CSS PWA frontend
- **`packages/shared`** — shared TypeScript types (must build before api/web can import)

## Commands

### Development

```bash
# Start MySQL
docker compose up -d

# Build shared types first (required before running api or web)
npm run build:shared

# Run API (port 3001)
npm run dev:api

# Run web (port 5173, proxies /api → localhost:3001)
npm run dev:web
```

### Database

```bash
# Apply migrations
npx prisma migrate dev --schema=packages/api/prisma/schema.prisma

# Seed database
npx prisma db seed --schema=packages/api/prisma/schema.prisma

# Open Prisma Studio
npx prisma studio --schema=packages/api/prisma/schema.prisma
```

### Testing

```bash
# Run all tests
npm test

# Run only API tests
npm test --workspace=packages/api

# Run only web tests
npm test --workspace=packages/web

# Run a single test file (from repo root)
npx vitest run packages/api/src/test/auth.test.ts
```

API tests hit a real MySQL database (no mocking). Ensure `docker compose up -d` is running before running API tests.

### Linting / Typecheck

```bash
npm run lint
npm run typecheck
```

## Architecture

### API (`packages/api/src/`)

- `index.ts` — starts Fastify on port 3001
- `app.ts` — builds the Fastify app, registers plugins and routes
- `config.ts` — upload directory paths
- `plugins/prisma.ts` — Prisma client as a Fastify plugin (accessible via `request.server.prisma`)
- `middleware/checkTokens.ts` — preHandler that verifies token balance ≥ cost before AI endpoints
- `routes/` — `auth.ts`, `children.ts`, `submissions.ts`, `tokens.ts`, `health.ts`
- `test/` — integration tests using `app.inject()`; `helpers.ts` provides `cleanDb()` and `registerParent()`

Auth flow: POST `/api/auth/register` or `/api/auth/login` → returns `accessToken` (JWT) + `refreshToken`. The JWT payload includes `parentId`, which is added to `request.parentId` by auth middleware.

### Web (`packages/web/src/`)

- `main.tsx` → `App.tsx` — React Router setup
- `context/AuthContext.tsx` — auth state (access token, user), login/logout helpers
- `lib/api.ts` — axios client with base `/api`, attaches Bearer token from `AuthContext`
- `pages/` — `LoginPage`, `RegisterPage`, `ChildSelectorPage`, `ChildDashboardPage`, `AddChildPage`, `EditChildPage`, `ScanPage`, `SubmissionResultPage`
- `test/` — Vitest + jsdom + React Testing Library

Vite dev server proxies `/api/*` to `http://localhost:3001`, so the web app always uses relative `/api` URLs.

### Shared (`packages/shared/src/`)

TypeScript types only. Must be built (`npm run build:shared`) before api or web can import from `@homework-ai/shared`. Types are in `src/types/` — `api.ts`, `auth.ts`, `subject.ts`, `token.ts`.

### Data Model (MySQL via Prisma)

Key models: `Parent` → `TokenBalance` (1:1), `TokenTransaction[]`, `Child[]`, `RefreshToken[]`. `Child` → `Submission[]`. `Submission` → `SubmissionImage[]` (1–10, ordered), `AiResponse[]`, `WrongAnswer[]`. `Child` → `PracticeSession[]` → `PracticeQuestion[]`.

`SystemConfig` is a key-value singleton table for app-wide defaults (e.g., free token grant amount).

### Environment Variables

API requires a `.env` file at `packages/api/.env`:

```
DATABASE_URL="mysql://app:app@localhost:3306/homework_ai"
JWT_SECRET="your-secret-key-here"
```

## Key Conventions

- Uploaded files (avatars, submission images) are stored locally under `packages/api/uploads/` and served at `/uploads/` via `@fastify/static`
- The `checkTokens(cost)` middleware is applied as a `preHandler` on any route that deducts tokens
- API tests use `singleFork: true` pool to avoid database connection conflicts
- Web tests run in `jsdom` environment; API calls in tests should be mocked via `vi.mock`

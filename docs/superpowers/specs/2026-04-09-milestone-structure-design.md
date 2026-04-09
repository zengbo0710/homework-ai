# Milestone Structure Design

> This document captures the organizational decisions made for M3–M9 per-milestone specs and plans.

## Goal

Split the combined M3–M9 master spec into focused per-milestone specs and implementation plans, each with explicit parallel execution tracks for concurrent agent work.

## Decisions

### Document structure
- One lean spec + one implementation plan per milestone (6 + 6 = 12 files)
- Master spec (`2026-04-09-m3-m9-ai-records-practice-reports-pwa-deploy-design.md`) stays as deep-design reference
- Per-milestone specs link to master rather than repeating it

### Spec format
Each spec contains: goal, what's already done, files changed, API contract, frontend routes, key decisions, out of scope, done criteria.

### Plan format
Each plan has a **Backend Track** and **Frontend Track** that agents execute concurrently, with named **SYNC** gates where tracks must wait before continuing. Single-track for M7 (frontend only) and M8/M9 (infra only).

### Docker timing
Local development for M3–M7 uses `npm run dev:api` / `npm run dev:web`. Docker setup deferred to M8/M9 so it matches a stable codebase before Coolify deployment.

### OpenAI configuration
AI model, max tokens, temperature, and provider are stored in `SystemConfig` DB table (seeded) and cached in memory for 5 minutes. `OPENAI_API_KEY` stays in env var only.

## Wave Sequence

| Wave | Milestones | Parallel? |
|------|-----------|-----------|
| 1 | M3 + M7 | Yes — independent |
| 2 | M4 | Sequential — needs M3 wrong_answers |
| 3 | M5 + M6 | Yes — both need M4 only |
| 4 | M8/M9 | Sequential — needs stable M7 codebase |

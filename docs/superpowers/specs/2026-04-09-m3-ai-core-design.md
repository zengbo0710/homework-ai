# M3 — AI Core Spec

> Full design reference: [master spec §Section 4](./2026-04-09-m3-m9-ai-records-practice-reports-pwa-deploy-design.md#section-4-m3--ai-core)

## Goal

Integrate OpenAI vision API into the submission flow: analyze uploaded homework images, auto-detect subject, grade all questions, deduct 1 token, persist AI response and wrong/partial answers to DB.

## What's Already Done

- `POST /api/submissions` — uploads images, resizes via sharp, creates `Submission` + `SubmissionImage` records with status `pending`
- `GET /api/submissions/:id` — returns submission with images, aiResponse, wrongAnswers
- `SubmissionResultPage.tsx` — navigates to result after upload; currently shows "pending" stub
- Prisma schema: `AiResponse`, `WrongAnswer`, `PracticeSession`, `PracticeQuestion` models all exist
- `checkTokens` middleware exists (preHandler pattern)

## Files Changed

| Action | Path | Purpose |
|--------|------|---------|
| Create | `packages/api/src/lib/ai-config.ts` | Read AI settings from SystemConfig, 5-min cache |
| Create | `packages/api/src/lib/openai.ts` | OpenAI client wrapper, base64 image encoding |
| Create | `packages/api/src/lib/ai-analysis.ts` | Build prompt, call OpenAI, parse JSON response |
| Create | `packages/api/src/lib/token-helpers.ts` | `deductToken` and `refundToken` DB transactions |
| Modify | `packages/api/src/routes/submissions.ts` | Wire AI analysis into POST flow (after image save) |
| Modify | `packages/api/prisma/seed.ts` | Seed SystemConfig: `ai_model`, `ai_max_tokens`, `ai_temperature`, `ai_provider` |
| Modify | `packages/web/src/pages/SubmissionResultPage.tsx` | Real polling + result rendering (summary card + answer cards) |

## API Contract

| Method | Path | Auth | Token Cost | Notes |
|--------|------|------|-----------|-------|
| POST | `/api/submissions` | JWT | 1 | Now synchronous: returns completed result (or failed) in response |
| GET | `/api/submissions/:id` | JWT | 0 | Unchanged — used by polling fallback |

POST flow is **synchronous** for MVP: the request waits for OpenAI to respond before returning. No background job queue. Timeout budget: 60s (OpenAI vision can be slow on 10 images).

## Key Decisions

- **AI call is synchronous** — simplest path for MVP; no job queue, no WebSocket
- **Token deducted before AI call** — refunded automatically on failure via `refundToken`
- **Only wrong + partial_correct questions saved** to `WrongAnswer` — correct answers displayed in response but not persisted
- **SystemConfig keys seeded**: `ai_model` = `"gpt-4o-mini"`, `ai_max_tokens` = `4096`, `ai_temperature` = `0.1`, `ai_provider` = `"openai"`
- **`OPENAI_API_KEY`** stays in `.env` only, never in DB
- Images sent to OpenAI as base64 data URIs (all images in a single request)
- Grade level injected into prompt from `child.grade` (P1–P6)
- SubmissionResultPage polls `GET /api/submissions/:id` every 3s while status is `pending` or `processing`; stops on `completed` or `failed`

## Frontend Routes

No new routes. `/submissions/:id` (SubmissionResultPage) is refined — same URL, richer UI.

## Out of Scope

- Gemini / alternative AI provider switching
- Streaming partial results
- Background job queue / webhooks
- Image quality blur detection
- Retry UI beyond navigating back to scan

## Done Criteria

- [ ] Upload 1–3 homework photos in Chrome → response returns within 60s
- [ ] AI result shows: subject badge, summary stats (correct / partial / wrong counts)
- [ ] Each wrong/partial answer card shows: question text, child answer, correct answer, explanation, topic badge
- [ ] Correct answers shown in result but absent from DB wrong_answers table
- [ ] Token balance decrements by 1 after successful scan
- [ ] Token refunded if AI call fails
- [ ] Changing `ai_model` in SystemConfig (via Prisma Studio) takes effect within 5 min without restart

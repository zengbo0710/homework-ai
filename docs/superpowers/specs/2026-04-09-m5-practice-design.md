# M5 — Practice Spec

> Full design reference: [master spec §Section 6](./2026-04-09-m3-m9-ai-records-practice-reports-pwa-deploy-design.md#section-6-m5--practice)

## Goal

Generate AI practice questions from a child's wrong answers for a subject, display them with hidden answers, and render an A4-printable worksheet.

## What's Already Done

- `PracticeSession`, `PracticeSessionSource`, `PracticeQuestion` Prisma models exist
- `getAiConfig` + `deductToken` / `refundToken` helpers available from M3
- Wrong answers accessible via M4 endpoints

## Files Changed

| Action | Path | Purpose |
|--------|------|---------|
| Create | `packages/api/src/lib/practice-generator.ts` | Build prompt, call OpenAI, parse questions |
| Create | `packages/api/src/routes/practice.ts` | Generate + list + get session endpoints |
| Modify | `packages/api/src/app.ts` | Register practiceRoutes |
| Create | `packages/web/src/pages/PracticePage.tsx` | Question list with show/hide answer toggle |
| Create | `packages/web/src/pages/PrintPage.tsx` | A4 print layout, CSS `@media print` |
| Modify | `packages/web/src/pages/SubjectDetailPage.tsx` | Add "Generate Practice" button on each tab |
| Modify | `packages/web/src/App.tsx` | Add `/practice/:sessionId` and `/practice/:sessionId/print` routes |

## API Contract

| Method | Path | Auth | Token Cost | Notes |
|--------|------|------|-----------|-------|
| POST | `/api/practice/generate` | JWT | 1 | Body: `{ childId, subject, source: "active"|"resolved", multiplier: 2 }` |
| GET | `/api/practice/sessions?childId=&subject=&page=&limit=` | JWT | 0 | List sessions newest-first |
| GET | `/api/practice/sessions/:id` | JWT | 0 | Session + all questions |

POST flow: check token balance → fetch wrong answers for subject+source → deduct token → call OpenAI → save PracticeSession + PracticeSessionSource + PracticeQuestion rows → return session with questions.

## Frontend Routes

| Route | Component |
|-------|-----------|
| `/practice/:sessionId` | `PracticePage` |
| `/practice/:sessionId/print` | `PrintPage` |

## Key Decisions

- **Default multiplier = 2** — each wrong answer generates 2 practice questions; configurable in request body
- **Source scope**: `active` = unresolved wrong answers; `resolved` = resolved wrong answers. Both tabs on SubjectDetailPage get a "Generate Practice" button
- **Minimum 1 wrong answer required** to generate; return 400 if none exist for source+subject
- **PrintPage** uses CSS `@media print` only — no PDF library. Questions section first, answer key section at the end, separated by a page break
- **PracticePage** answers are hidden by default; per-question "Show Answer" toggle
- Session is AI-generated synchronously (same pattern as M3) — request waits for OpenAI

## Out of Scope

- Configurable multiplier UI (API accepts it but UI sends default 2)
- Saving print preference
- Re-generating a session
- Difficulty tuning

## Done Criteria

- [ ] "Generate Practice" button on SubjectDetailPage (Active tab) triggers generation
- [ ] Token balance decrements by 1
- [ ] PracticePage shows numbered questions with answers hidden
- [ ] "Show Answer" toggle reveals answer + explanation per question
- [ ] "Print" button opens PrintPage
- [ ] PrintPage renders A4 layout: questions first, answer key at the end
- [ ] `window.print()` produces clean output with no nav/UI chrome

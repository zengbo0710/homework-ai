# M4 — Records Spec

> Full design reference: [master spec §Section 5](./2026-04-09-m3-m9-ai-records-practice-reports-pwa-deploy-design.md#section-5-m4--records)

## Goal

Expose wrong-answer CRUD endpoints and build the SubjectDetailPage: a two-tab view (Active / Resolved) per subject where parents can review, resolve, unresolve, and delete wrong answers.

## What's Already Done

- `WrongAnswer` Prisma model with `resolvedAt`, `subject`, `topic`, `status` fields
- `ChildDashboardPage` with 5 subject blocks (no navigation or badges yet)
- Auth middleware and `request.parentId` available on all routes

## Files Changed

| Action | Path | Purpose |
|--------|------|---------|
| Create | `packages/api/src/routes/wrong-answers.ts` | CRUD + summary endpoints |
| Modify | `packages/api/src/app.ts` | Register wrongAnswerRoutes |
| Create | `packages/web/src/pages/SubjectDetailPage.tsx` | Active/Resolved tabs, action buttons |
| Modify | `packages/web/src/pages/ChildDashboardPage.tsx` | Fetch summary badges, navigate to subject detail |
| Modify | `packages/web/src/App.tsx` | Add `/subjects/:childId/:subject` route |

## API Contract

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/wrong-answers?childId=&subject=&resolved=false&page=&limit=` | JWT | Paginated list; `resolved=true` returns resolved |
| GET | `/api/wrong-answers/summary?childId=` | JWT | Count of unresolved per subject `{ math: 3, english: 0, … }` |
| PATCH | `/api/wrong-answers/:id/resolve` | JWT | Sets `resolvedAt = now()` |
| PATCH | `/api/wrong-answers/:id/unresolve` | JWT | Clears `resolvedAt` |
| DELETE | `/api/wrong-answers/:id` | JWT | Hard delete — permanent |

All write endpoints verify the wrong answer belongs to the authenticated parent's child.

## Frontend Routes

| Route | Component | Notes |
|-------|-----------|-------|
| `/subjects/:childId/:subject` | `SubjectDetailPage` | New |

## Key Decisions

- **Optimistic UI** — resolve/unresolve/delete removes the card from the list immediately without waiting for API confirmation; revert on error
- **Hard delete** — no soft-delete; DELETE is permanent per product spec
- Dashboard subject block badges show unresolved count from `summary` endpoint; 0 count shows no badge
- Subject blocks on ChildDashboardPage navigate to `/subjects/:childId/:subject`
- Pagination: default 20 items per page; "Load more" button (no infinite scroll)
- `subject` URL param values match Prisma enum: `math`, `english`, `science`, `chinese`, `higher_chinese`

## Out of Scope

- Filtering/sorting beyond active vs resolved
- Bulk resolve/delete
- Topic grouping view (that's M6 — Reports)

## Done Criteria

- [ ] Each subject block on dashboard shows red badge with unresolved count
- [ ] Tapping Math → SubjectDetailPage shows Active tab with wrong answer cards
- [ ] Cards show: question text, child answer, correct answer, explanation, topic badge
- [ ] Resolve button moves card to Resolved tab immediately (optimistic)
- [ ] Resolved tab shows resolved cards with Unresolve button
- [ ] Delete button permanently removes card from both tabs
- [ ] Empty state shown when no wrong answers exist

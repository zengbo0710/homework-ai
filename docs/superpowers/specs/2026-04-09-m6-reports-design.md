# M6 — Reports Spec

> Full design reference: [master spec §Section 7](./2026-04-09-m3-m9-ai-records-practice-reports-pwa-deploy-design.md#section-7-m6--reports)

## Goal

Generate an AI-powered weakness report per subject that groups wrong answers by topic, ranks weaknesses by frequency and severity, and provides a one-click "Practice Weaknesses" shortcut.

## What's Already Done

- Wrong answers with `topic` and `subject` fields available from M3/M4
- `getAiConfig`, `deductToken`, `refundToken` helpers from M3
- SubjectDetailPage exists from M4 (add "Generate Report" button there)

## Files Changed

| Action | Path | Purpose |
|--------|------|---------|
| Modify | `packages/api/prisma/schema.prisma` | Add `WeaknessReport` model |
| Run | `prisma migrate dev` | Create migration for WeaknessReport table |
| Create | `packages/api/src/lib/weakness-analyzer.ts` | Build prompt, call OpenAI, parse report |
| Create | `packages/api/src/routes/reports.ts` | Generate + get latest report endpoints |
| Modify | `packages/api/src/app.ts` | Register reportRoutes |
| Create | `packages/web/src/pages/WeaknessReportPage.tsx` | Summary, topic breakdown, ranked weaknesses, practice button |
| Modify | `packages/web/src/pages/SubjectDetailPage.tsx` | Add "Generate Report" button |
| Modify | `packages/web/src/App.tsx` | Add `/reports/:childId/:subject` route |

## API Contract

| Method | Path | Auth | Token Cost | Notes |
|--------|------|------|-----------|-------|
| POST | `/api/reports/weakness` | JWT | 1 | Body: `{ childId, subject }` — analyzes all unresolved wrong answers |
| GET | `/api/reports/weakness?childId=&subject=` | JWT | 0 | Returns latest report for subject |

POST requires ≥ 1 unresolved wrong answer for the subject; returns 400 otherwise.

## Schema Addition

```prisma
model WeaknessReport {
  id             String   @id @default(uuid())
  childId        String
  subject        Subject
  sourceWrongIds Json     // string[] of wrong answer IDs analyzed
  topicGroups    Json     // { topic, wrongCount, partialCount }[]
  weaknesses     Json     // { rank, topic, severity, pattern, suggestion }[]
  summary        String   @db.Text
  totalQuestions Int
  totalTopics    Int
  modelUsed      String?  @db.VarChar(50)
  createdAt      DateTime @default(now())

  child Child @relation(fields: [childId], references: [id], onDelete: Cascade)

  @@index([childId, subject])
  @@map("weakness_reports")
}
```

Child model also gets `weaknessReports WeaknessReport[]` relation added.

## Frontend Routes

| Route | Component |
|-------|-----------|
| `/reports/:childId/:subject` | `WeaknessReportPage` |

## Key Decisions

- **Always analyzes all unresolved wrong answers** for the subject (not paginated input)
- **One report per generation** — each POST creates a new report; GET returns the latest one
- **"Practice Weaknesses" button** on WeaknessReportPage calls `POST /api/practice/generate` with `source: "active"` then navigates to PracticePage
- WeaknessReportPage severity badges: `high` = red, `medium` = yellow, `low` = blue
- Topic breakdown shown as a simple count bar (CSS width %, no charting library)

## Out of Scope

- Historical report list / report comparison
- Exporting report as PDF
- Scheduling automated reports

## Done Criteria

- [ ] "Generate Report" button on SubjectDetailPage generates and navigates to WeaknessReportPage
- [ ] Token balance decrements by 1
- [ ] Report shows summary paragraph
- [ ] Topic breakdown lists topics with wrong counts and a visual bar
- [ ] Ranked weaknesses show topic, severity badge, pattern description, suggestion
- [ ] "Practice Weaknesses" button generates practice session and navigates to PracticePage
- [ ] GET endpoint returns most recent report without re-charging a token

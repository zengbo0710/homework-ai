# Per-Question Crops + Strict Dedup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two scan-flow defects: (a) when a question has no diagram, wrong-answer cards currently fall back to the whole-page image — they should show just the crop of that question's region on the page; (b) once a question has been recorded, scanning the same question again (from any photo) must not create a duplicate row, regardless of whether the earlier copy was resolved.

**Architecture:**
- Extend the AI vision schema so every question returns a normalized `region: {x,y,w,h}` bounding box for its text block (not just figures). Backend crops that region with `sharp` and stores the URL in a new `questionImageUrl` column. UI prefers figure crop first, then question crop, and removes the page-level fallback so Q2/Q8 no longer display the whole page.
- Tighten dedup to child-scoped history: drop the `resolvedAt: null` filter and compare against a normalized (trim + collapse whitespace) form of `questionText`. A normalized text column + compound index gives us fast lookups and a clean DB-side constraint we can lean on in future.

**Tech Stack:** Prisma 5 / MySQL 8, `sharp` for crops, `@fastify/multipart`, OpenAI `gpt-4o-mini` vision, React + Vite UI.

---

## Files to touch

- Create: `packages/api/prisma/migrations/<timestamp>_add_question_image_url_and_normalized_text/migration.sql` — DB migration
- Modify: `packages/api/prisma/schema.prisma` — add `questionImageUrl` + `questionTextNormalized` fields, compound index
- Create: `packages/api/src/lib/text-normalize.ts` — `normalizeQuestionText()` helper
- Modify: `packages/api/src/lib/ai-analysis.ts` — add `region` to `AiQuestion`, extend prompt
- Modify: `packages/api/src/routes/submissions.ts` — crop question region, write new columns, use strict dedup
- Modify: `packages/api/src/routes/wrong-answers.ts` — surface `questionImageUrl` in GET response
- Modify: `packages/api/src/test/submissions.test.ts` — update mocks with `region`, add new-behavior tests
- Modify: `packages/web/src/pages/SubjectDetailPage.tsx` — prefer figure → question crop; drop page fallback
- Modify: `packages/web/src/pages/SubmissionResultPage.tsx` — same render hierarchy on the result page

---

## Task 1: Normalize-text helper + unit test

**Files:**
- Create: `packages/api/src/lib/text-normalize.ts`
- Create: `packages/api/src/test/text-normalize.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/src/test/text-normalize.test.ts
import { describe, it, expect } from 'vitest';
import { normalizeQuestionText } from '../lib/text-normalize';

describe('normalizeQuestionText', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeQuestionText('  5  ×  3  =  ?  ')).toBe('5 × 3 = ?');
  });
  it('collapses multi-line whitespace', () => {
    expect(normalizeQuestionText('What is\n\n5×3?\n')).toBe('What is 5×3?');
  });
  it('lower-cases for case-insensitive compare', () => {
    expect(normalizeQuestionText('Name the Plant')).toBe('name the plant');
  });
  it('strips common zero-width and NBSP chars', () => {
    expect(normalizeQuestionText('foo\u00a0bar\u200b')).toBe('foo bar');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/api/src/test/text-normalize.test.ts`
Expected: FAIL with "Cannot find module '../lib/text-normalize'"

- [ ] **Step 3: Write the minimal implementation**

```ts
// packages/api/src/lib/text-normalize.ts
export function normalizeQuestionText(raw: string): string {
  return raw
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/api/src/test/text-normalize.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/lib/text-normalize.ts packages/api/src/test/text-normalize.test.ts
git commit -m "feat(api): add normalizeQuestionText helper for dedup comparisons"
```

---

## Task 2: Prisma migration for `questionImageUrl` + normalized text column

**Files:**
- Modify: `packages/api/prisma/schema.prisma:179-205` (WrongAnswer model)
- Create: `packages/api/prisma/migrations/<timestamp>_add_question_image_url_and_normalized_text/migration.sql`

- [ ] **Step 1: Edit `schema.prisma`** — add two fields and a compound index on the `WrongAnswer` model.

Replace the existing `WrongAnswer` model block with:

```prisma
model WrongAnswer {
  id                     String            @id @default(uuid())
  submissionId           String
  childId                String
  subject                Subject
  questionNumber         Int
  imageOrder             Int
  questionText           String            @db.Text
  questionTextNormalized String            @db.VarChar(500)
  childAnswer            String?           @db.Text
  correctAnswer          String            @db.Text
  status                 WrongAnswerStatus
  explanation            String            @db.Text
  topic                  String?           @db.VarChar(100)
  difficulty             String?           @db.VarChar(20)
  figureImageUrl         String?           @db.VarChar(500)
  questionImageUrl       String?           @db.VarChar(500)
  resolvedAt             DateTime?
  createdAt              DateTime          @default(now())

  submission      Submission              @relation(fields: [submissionId], references: [id], onDelete: Cascade)
  child           Child                   @relation(fields: [childId], references: [id], onDelete: Cascade)
  practiceSources PracticeSessionSource[]

  @@index([childId])
  @@index([childId, subject])
  @@index([childId, topic])
  @@index([childId, subject, questionTextNormalized])
  @@map("wrong_answers")
}
```

Note: `VARCHAR(500)` is deliberate — long enough for a normalized Singapore-primary question stem, short enough to sit in a MySQL B-Tree index (utf8mb4 × 500 ≈ 2000 bytes, well under InnoDB's 3072-byte key limit).

- [ ] **Step 2: Generate the migration (dev DB must be running)**

Run:

```bash
docker compose up -d
npx prisma migrate dev --schema=packages/api/prisma/schema.prisma \
  --name add_question_image_url_and_normalized_text --create-only
```

Expected: prints the new migration path under `packages/api/prisma/migrations/`.

- [ ] **Step 3: Inspect + hand-edit the generated SQL**

Open `packages/api/prisma/migrations/<timestamp>_add_question_image_url_and_normalized_text/migration.sql` and replace its contents with:

```sql
-- AlterTable
ALTER TABLE `wrong_answers`
  ADD COLUMN `questionImageUrl` VARCHAR(500) NULL,
  ADD COLUMN `questionTextNormalized` VARCHAR(500) NOT NULL DEFAULT '';

-- Backfill existing rows with a best-effort normalized copy
UPDATE `wrong_answers`
SET `questionTextNormalized` = LOWER(TRIM(REGEXP_REPLACE(LEFT(`questionText`, 500), '[[:space:]]+', ' ')));

-- CreateIndex
CREATE INDEX `wrong_answers_childId_subject_questionTextNormalized_idx`
  ON `wrong_answers`(`childId`, `subject`, `questionTextNormalized`);
```

Why override the auto-SQL: Prisma by default won't emit a backfill `UPDATE` for a new NOT NULL column, so rows created before the migration would be empty strings and could dedup-collide with each other. The backfill collapses whitespace in existing rows so they participate in the new dedup check correctly.

- [ ] **Step 4: Apply the migration**

Run:

```bash
npx prisma migrate dev --schema=packages/api/prisma/schema.prisma
```

Expected: "The following migration(s) have been applied" including the new one. `@prisma/client` is regenerated automatically by the postinstall hook.

- [ ] **Step 5: Commit**

```bash
git add packages/api/prisma/schema.prisma packages/api/prisma/migrations/
git commit -m "feat(db): add questionImageUrl + normalized text column to wrong_answers"
```

---

## Task 3: Extend AI schema with per-question `region`

**Files:**
- Modify: `packages/api/src/lib/ai-analysis.ts:10-22` (AiQuestion interface) and `:60-100` (prompt)

- [ ] **Step 1: Add `region` to the `AiQuestion` interface**

Replace the `AiQuestion` interface in `packages/api/src/lib/ai-analysis.ts` with:

```ts
export interface AiQuestion {
  questionNumber: number;
  imageOrder: number;
  questionText: string;
  childAnswer: string | null;
  correctAnswer: string;
  status: 'correct' | 'wrong' | 'partial_correct';
  explanation: string;
  topic: string | null;
  difficulty: string | null;
  figureId?: number | null;
  region: { x: number; y: number; w: number; h: number };
}
```

- [ ] **Step 2: Extend the system prompt**

In the same file, inside the `questions` block of the JSON schema string, update the schema to include `region` and add an explanatory rule block. Find the `"questions": [{` schema block and replace it with:

```ts
  "questions": [{
    "questionNumber": number,
    "imageOrder": number,
    "questionText": "Full self-contained question including any necessary context/scenario",
    "childAnswer": "What the child wrote (null if blank)",
    "correctAnswer": "The correct answer",
    "status": "correct|wrong|partial_correct",
    "explanation": "Why the answer is wrong/partial (empty string if correct)",
    "topic": "Topic tag (e.g. addition, grammar, forces)",
    "difficulty": "easy|medium|hard",
    "figureId": 1 or null,
    "region": {"x": 0.0, "y": 0.0, "w": 1.0, "h": 0.2}
  }]
```

And immediately after the existing `IMPORTANT — figures array rules:` block, append:

```ts
IMPORTANT — questions[].region rules:
Every question MUST include a "region" bounding box on its own imageOrder. The box covers the FULL content of the question: question number, stem, all sub-parts, answer blanks, and the child's handwritten answer. Include a small margin (a few pixels) but do NOT include unrelated neighbour questions. x/y are fractions of the image's top-left origin, w/h are fractions of the image dimensions, all in [0.0, 1.0].
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck --workspace=packages/api`
Expected: PASS (no type errors).

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/lib/ai-analysis.ts
git commit -m "feat(ai): have vision prompt return per-question region bounding box"
```

---

## Task 4: Red test — dedup rejects duplicates even across resolved history

**Files:**
- Modify: `packages/api/src/test/submissions.test.ts`

Goal: a test that fails against current code (because today's dedup only checks unresolved rows), and passes once Task 5 lands.

- [ ] **Step 1: Add the failing test**

Near the existing `describe('POST /api/submissions')` block in `submissions.test.ts`, append this test inside the same `describe`:

```ts
  it('does not create a duplicate wrong-answer when the same question was resolved earlier', async () => {
    // Seed a previously-resolved wrong answer for the same child+subject+question
    const submission = await prisma.submission.create({
      data: { childId, imageCount: 1, status: 'completed' },
    });
    await prisma.wrongAnswer.create({
      data: {
        submissionId: submission.id,
        childId,
        subject: 'math',
        questionNumber: 99,
        imageOrder: 1,
        questionText: '5×3=?',
        questionTextNormalized: '5×3=?',
        childAnswer: '14',
        correctAnswer: '15',
        status: 'wrong',
        explanation: 'prev',
        resolvedAt: new Date(),
      },
    });

    const { body, contentType } = buildMultipart(childId, minimalJpeg);
    const res = await app.inject({
      method: 'POST', url: '/api/submissions',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': contentType },
      payload: body,
    });

    expect(res.statusCode).toBe(201);
    const waCount = await prisma.wrongAnswer.count({
      where: { childId, questionTextNormalized: '5×3=?' },
    });
    expect(waCount).toBe(1); // NOT 2 — the resolved row must block the new one
  });
```

Also, anywhere the existing mocked `analyzeHomework` questions are declared, add `region: { x: 0, y: 0, w: 1, h: 0.2 }` to each question object so they match the new interface:

```ts
{
  questionNumber: 1, imageOrder: 1, questionText: '1+1=?', childAnswer: '2',
  correctAnswer: '2', status: 'correct', explanation: '', topic: 'addition', difficulty: 'easy',
  figureId: null,
  region: { x: 0, y: 0, w: 1, h: 0.2 },
},
{
  questionNumber: 2, imageOrder: 1, questionText: '5×3=?', childAnswer: '14',
  correctAnswer: '15', status: 'wrong', explanation: 'Multiplication error',
  topic: 'multiplication', difficulty: 'medium', figureId: null,
  region: { x: 0, y: 0.2, w: 1, h: 0.2 },
},
```

- [ ] **Step 2: Run the new test to verify it fails**

Run: `npx vitest run packages/api/src/test/submissions.test.ts -t "does not create a duplicate"`
Expected: FAIL — `waCount` is `2` because today's code only skips when there's an unresolved match.

- [ ] **Step 3: Commit the red test**

```bash
git add packages/api/src/test/submissions.test.ts
git commit -m "test(submissions): dedup must skip duplicates even when previous copy is resolved"
```

---

## Task 5: Strict dedup + question-region cropping in submissions route

**Files:**
- Modify: `packages/api/src/routes/submissions.ts:114-173`

- [ ] **Step 1: Add the normalize import + question-region crop loop**

In `packages/api/src/routes/submissions.ts`, add this import at the top:

```ts
import { normalizeQuestionText } from '../lib/text-normalize';
```

Then replace the block that starts with `// Build figureId → cropped image URL map` through the end of the `toSave` loop (roughly lines 114-173) with:

```ts
      // Build figureId → cropped image URL map (crop each unique figure once)
      const figureUrlMap = new Map<number, string>();
      for (const fig of (result.figures ?? [])) {
        if (fig.imageOrder < 1 || fig.imageOrder > processedBuffers.length) continue;
        try {
          const buf = processedBuffers[fig.imageOrder - 1];
          const meta = await sharp(buf).metadata();
          const imgW = meta.width ?? 800;
          const imgH = meta.height ?? 1000;
          const left = Math.max(0, Math.round(fig.region.x * imgW));
          const top = Math.max(0, Math.round(fig.region.y * imgH));
          const width = Math.min(imgW - left, Math.max(1, Math.round(fig.region.w * imgW)));
          const height = Math.min(imgH - top, Math.max(1, Math.round(fig.region.h * imgH)));
          const cropBuf = await sharp(buf)
            .extract({ left, top, width, height })
            .jpeg({ quality: 85 })
            .toBuffer();
          const cropFilename = `${uuidv4()}.jpg`;
          fs.writeFileSync(path.join(submissionsDir, cropFilename), cropBuf);
          figureUrlMap.set(fig.id, `/uploads/submissions/${cropFilename}`);
        } catch (cropErr) {
          console.warn('[submissions] figure_crop_failed:', cropErr);
        }
      }

      // Crop per-question regions (always, for all wrong/partial questions)
      async function cropQuestionRegion(q: typeof result.questions[number]): Promise<string | null> {
        if (!q.region || q.imageOrder < 1 || q.imageOrder > processedBuffers.length) return null;
        try {
          const buf = processedBuffers[q.imageOrder - 1];
          const meta = await sharp(buf).metadata();
          const imgW = meta.width ?? 800;
          const imgH = meta.height ?? 1000;
          const left = Math.max(0, Math.round(q.region.x * imgW));
          const top = Math.max(0, Math.round(q.region.y * imgH));
          const width = Math.min(imgW - left, Math.max(1, Math.round(q.region.w * imgW)));
          const height = Math.min(imgH - top, Math.max(1, Math.round(q.region.h * imgH)));
          const cropBuf = await sharp(buf)
            .extract({ left, top, width, height })
            .jpeg({ quality: 85 })
            .toBuffer();
          const cropFilename = `${uuidv4()}.jpg`;
          fs.writeFileSync(path.join(submissionsDir, cropFilename), cropBuf);
          return `/uploads/submissions/${cropFilename}`;
        } catch (cropErr) {
          console.warn('[submissions] question_crop_failed:', cropErr);
          return null;
        }
      }

      // Save only wrong + partial_correct, skipping duplicates across full history
      const toSave = result.questions.filter((q) => q.status !== 'correct');
      for (const q of toSave) {
        const normalized = normalizeQuestionText(q.questionText).slice(0, 500);

        // Strict dedup: skip if the same normalized question already exists for this child+subject,
        // regardless of resolvedAt status.
        const existing = await app.prisma.wrongAnswer.findFirst({
          where: {
            childId,
            subject: result.subject as Subject,
            questionTextNormalized: normalized,
          },
          select: { id: true },
        });
        if (existing) continue;

        const figureImageUrl = q.figureId != null ? (figureUrlMap.get(q.figureId) ?? null) : null;
        const questionImageUrl = await cropQuestionRegion(q);

        await app.prisma.wrongAnswer.create({
          data: {
            submissionId: submission.id,
            childId,
            subject: result.subject as Subject,
            questionNumber: q.questionNumber,
            imageOrder: q.imageOrder,
            questionText: q.questionText,
            questionTextNormalized: normalized,
            childAnswer: q.childAnswer ?? null,
            correctAnswer: q.correctAnswer,
            status: q.status as WrongAnswerStatus,
            explanation: q.explanation,
            topic: q.topic ?? null,
            difficulty: q.difficulty ?? null,
            figureImageUrl,
            questionImageUrl,
          },
        });
      }
```

- [ ] **Step 2: Run the red test — should now pass**

Run: `npx vitest run packages/api/src/test/submissions.test.ts -t "does not create a duplicate"`
Expected: PASS (count is 1).

- [ ] **Step 3: Run the full submissions test file — should still pass**

Run: `npx vitest run packages/api/src/test/submissions.test.ts`
Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/routes/submissions.ts
git commit -m "feat(submissions): crop per-question regions + strict history-wide dedup"
```

---

## Task 6: Surface `questionImageUrl` on the GET wrong-answers response

**Files:**
- Modify: `packages/api/src/routes/wrong-answers.ts:60-74`

- [ ] **Step 1: Add the new field to the API response shape**

In `packages/api/src/routes/wrong-answers.ts`, inside the `data: data.map((wa) => ({ ... }))` block, add `questionImageUrl: wa.questionImageUrl,` right after `figureImageUrl`:

```ts
      data: data.map((wa) => ({
        id: wa.id,
        subject: wa.subject,
        questionNumber: wa.questionNumber,
        imageOrder: wa.imageOrder,
        questionText: wa.questionText,
        childAnswer: wa.childAnswer,
        correctAnswer: wa.correctAnswer,
        status: wa.status,
        explanation: wa.explanation,
        topic: wa.topic,
        figureImageUrl: wa.figureImageUrl,
        questionImageUrl: wa.questionImageUrl,
        pageImageUrl: wa.submission.images.find((img) => img.sortOrder === wa.imageOrder)?.imageUrl ?? null,
        resolvedAt: wa.resolvedAt,
        createdAt: wa.createdAt,
      })),
```

- [ ] **Step 2: Add a route test asserting the field is present**

Inside the existing `describe('GET /api/wrong-answers', ...)` block in `packages/api/src/test/wrong-answers.test.ts`, add this test:

```ts
    it('returns questionImageUrl when set on the wrong answer', async () => {
      await seedWrongAnswer(childId, submissionId, {
        questionImageUrl: '/uploads/submissions/test-question.jpg',
      });
      const res = await app.inject({
        method: 'GET', url: `/api/wrong-answers?childId=${childId}&subject=math&resolved=false`,
        headers: auth(),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data[0].questionImageUrl).toBe('/uploads/submissions/test-question.jpg');
    });
```

Also update the `seedWrongAnswer` helper at the top of the same file to include the required `questionTextNormalized` value:

```ts
async function seedWrongAnswer(childId: string, submissionId: string, overrides = {}) {
  return prisma.wrongAnswer.create({
    data: {
      submissionId,
      childId,
      subject: 'math',
      questionNumber: 1,
      imageOrder: 1,
      questionText: 'What is 5×3?',
      questionTextNormalized: 'what is 5×3?',
      childAnswer: '14',
      correctAnswer: '15',
      status: 'wrong',
      explanation: 'Multiplication error',
      topic: 'multiplication',
      ...overrides,
    },
  });
}
```

- [ ] **Step 3: Run the wrong-answers test file**

Run: `npx vitest run packages/api/src/test/wrong-answers.test.ts`
Expected: all tests PASS, including the new one.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/routes/wrong-answers.ts packages/api/src/test/wrong-answers.test.ts
git commit -m "feat(api): expose questionImageUrl in GET /api/wrong-answers"
```

---

## Task 7: UI — prefer figure crop, then question crop, drop page fallback

**Files:**
- Modify: `packages/web/src/pages/SubjectDetailPage.tsx:6-18` (WrongAnswer type) and `:184-193` (render block)

- [ ] **Step 1: Add `questionImageUrl` to the client-side type**

Replace the `WrongAnswer` interface in `packages/web/src/pages/SubjectDetailPage.tsx` with:

```tsx
interface WrongAnswer {
  id: string;
  questionNumber: number;
  questionText: string;
  childAnswer: string | null;
  correctAnswer: string;
  status: 'wrong' | 'partial_correct';
  explanation: string;
  topic: string | null;
  figureImageUrl: string | null;
  questionImageUrl: string | null;
  pageImageUrl: string | null;
  resolvedAt: string | null;
}
```

- [ ] **Step 2: Replace the image-render block to use the new hierarchy**

Find the block:

```tsx
            {/* Cropped figure — shown when AI identified a diagram */}
            {wa.figureImageUrl && (
              <img
                src={wa.figureImageUrl}
                alt="Figure"
                className="rounded-lg border border-gray-200 w-full object-contain mb-3 max-h-64"
              />
            )}
            {/* Full page — collapsible fallback */}
            {!wa.figureImageUrl && wa.pageImageUrl && <QuestionImage imageUrl={wa.pageImageUrl} />}
```

And replace it with:

```tsx
            {wa.figureImageUrl && (
              <img
                src={wa.figureImageUrl}
                alt="Figure"
                className="rounded-lg border border-gray-200 w-full object-contain mb-3 max-h-64"
              />
            )}
            {wa.questionImageUrl && (
              <img
                src={wa.questionImageUrl}
                alt="Question"
                className="rounded-lg border border-gray-200 w-full object-contain mb-3 max-h-80"
              />
            )}
            {!wa.figureImageUrl && !wa.questionImageUrl && wa.pageImageUrl && (
              <QuestionImage imageUrl={wa.pageImageUrl} />
            )}
```

Rationale: we now show the figure (if any) AND the question crop (always, once new rows land). The page-level fallback stays only for legacy rows that pre-date the migration and therefore have no `questionImageUrl`.

- [ ] **Step 3: Run the web tests + typecheck**

Run: `npm run typecheck --workspace=packages/web && npm test --workspace=packages/web`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/pages/SubjectDetailPage.tsx
git commit -m "feat(web): show per-question crop instead of full page when no figure"
```

---

## Task 8: UI — mirror render change on the scan-result page

**Files:**
- Modify: `packages/web/src/pages/SubmissionResultPage.tsx`

Goal: after a scan completes, the result page should use the same figure → question-crop → page-fallback hierarchy as `SubjectDetailPage`.

- [ ] **Step 1: Locate the render block**

Open `packages/web/src/pages/SubmissionResultPage.tsx` and find where `figureImageUrl` is rendered for each wrong answer. (If the page currently only renders figure-or-nothing, or figure-or-whole-page, bring it in line.)

- [ ] **Step 2: Add `questionImageUrl` to the relevant interface, and update the render**

Mirror the hierarchy from Task 7 — prefer figure, then question crop, then (legacy) page fallback. Example block to insert:

```tsx
{wa.figureImageUrl && (
  <img src={wa.figureImageUrl} alt="Figure" className="rounded-lg border border-gray-200 w-full object-contain mb-3 max-h-64" />
)}
{wa.questionImageUrl && (
  <img src={wa.questionImageUrl} alt="Question" className="rounded-lg border border-gray-200 w-full object-contain mb-3 max-h-80" />
)}
{!wa.figureImageUrl && !wa.questionImageUrl && wa.pageImageUrl && (
  <img src={wa.pageImageUrl} alt="Page" className="rounded-lg border border-gray-200 w-full object-contain mb-3 max-h-80" />
)}
```

Use whatever container/class names already exist in `SubmissionResultPage.tsx` to match its visual style — do not invent new ones.

- [ ] **Step 3: Typecheck + run web tests**

Run: `npm run typecheck --workspace=packages/web && npm test --workspace=packages/web`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/pages/SubmissionResultPage.tsx
git commit -m "feat(web): use per-question crop on submission result page"
```

---

## Task 9: End-to-end manual verification

**Files:** (no code changes)

- [ ] **Step 1: Start services**

```bash
docker compose up -d
npm run build:shared
npm run dev:api    # terminal 1, port 3001
npm run dev:web    # terminal 2, port 5173
```

- [ ] **Step 2: Scan the science fixture twice and verify dedup**

- Log in (or register), pick a child.
- Upload `test/IMG_6896.jpg` + `test/IMG_6897.jpg`.
- On the result page, confirm every wrong/partial card shows a crop of its own question (Q2 and Q8 must NOT show the whole page anymore).
- Navigate to Subject detail → Science. Note the wrong-answer count N.
- Re-upload the same two science photos.
- Verify the count is STILL N (no duplicates added). Check the server log — you should see no new `wrongAnswer.create` calls for the previously-seen questions.

- [ ] **Step 3: Mark one of the old wrong answers "Resolved", then re-scan**

- Mark one science question Resolved in the UI.
- Upload the same two science photos again.
- The resolved question must NOT reappear as a new unresolved row. Active count remains unchanged.

- [ ] **Step 4: Record the verification**

Append a short note to the commit body below (or to the PR description) summarising: (1) Q2/Q8 now show only their own question region, (2) re-scan produces zero new rows, (3) resolved-then-rescan also produces zero new rows.

- [ ] **Step 5: Open a draft PR (optional, if you're on a branch)**

```bash
git push -u origin HEAD
gh pr create --title "Per-question crops + strict wrong-answer dedup" --body "$(cat <<'EOF'
## Summary
- Wrong-answer cards now show a crop of just the question's region when there's no diagram, fixing the "whole page" fallback for Science Q2/Q8.
- Dedup is now child-scoped across full history (including resolved) using a normalized text column + index — re-scanning the same worksheet never creates duplicate rows.

## Test plan
- [ ] `npm run typecheck && npm test`
- [ ] Manual: science re-scan creates zero new rows
- [ ] Manual: Q2/Q8 cards show only the question region, not the whole page
EOF
)"
```

---

## Self-review checklist (author before handoff)

1. **Spec coverage:** Both user requirements covered?
   - (a) Per-question crop instead of whole-page fallback — Tasks 3, 5, 7, 8.
   - (b) No duplicate rows across full history — Tasks 1, 2, 4, 5.
2. **Placeholder scan:** No TBDs, no "similar to", no vague error-handling. Every code change has full code blocks.
3. **Type consistency:** `region` shape is `{x,y,w,h}` in both `AiFigure` and `AiQuestion`. `questionImageUrl` is the field name across Prisma, API response, and UI type.
4. **Migration correctness:** `questionTextNormalized` is NOT NULL with a backfill; compound index fits under MySQL's 3072-byte key limit (VARCHAR(500) × utf8mb4 = 2000 bytes; plus `childId` uuid char(36) + `subject` enum = well within limits).

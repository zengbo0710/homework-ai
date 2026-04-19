# Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the top-priority security and correctness gaps found in the 2026-04-19 review: stop committing uploaded avatars, harden file-upload validation (magic bytes), add rate limiting + CORS, and make AI-call failure handling observable with an enforced timeout.

**Architecture:** Four independent, commit-per-task changes to `packages/api`. Each task lands as its own commit so any can be reverted in isolation. Validation and networking concerns stay in the route handlers or Fastify plugins; no new abstractions are introduced. All new behavior is proved with a vitest integration test that hits the real MySQL DB via `buildApp()`/`app.inject()` — matching the existing test style in `packages/api/src/test/`.

**Tech Stack:** Fastify 4, `@fastify/multipart`, `@fastify/rate-limit`, `@fastify/cors`, `file-type` (magic-byte sniffing), Prisma (MySQL), vitest.

---

## File Structure

Files that will be created or modified:

- **Modify** `.gitignore` — ignore `packages/api/uploads/` except `.gitkeep`s.
- **Modify** `packages/api/src/routes/submissions.ts` — magic-byte check on upload; remove redundant pre-balance check; explicit logged refund catch.
- **Modify** `packages/api/src/routes/children.ts` — magic-byte check on avatar upload.
- **Create** `packages/api/src/lib/image-validation.ts` — shared magic-byte validator; single allowed-types list.
- **Modify** `packages/api/src/app.ts` — register `@fastify/rate-limit` and `@fastify/cors`; wire per-route limit on submissions.
- **Modify** `packages/api/src/lib/ai-analysis.ts` — plumb an `AbortSignal` timeout through the OpenAI call.
- **Modify** `packages/api/package.json` — add `file-type`, `@fastify/rate-limit`, `@fastify/cors` deps.
- **Modify** `packages/api/src/test/submissions.test.ts` — new tests: non-image rejection, rate limit 429, refund-on-AI-failure.
- **Modify** `packages/api/src/test/children.test.ts` — new test: non-image avatar rejection.
- **Create** `packages/api/src/test/cors.test.ts` — CORS preflight test.

---

## Task 1: Stop committing uploaded files

Currently 50 untracked avatar JPGs sit in `packages/api/uploads/avatars/`. Only `.gitkeep` is tracked. The directory is user-content and must never be committed.

**Files:**
- Modify: `/Users/zengbo/GitHub/homework-ai/.gitignore`

- [ ] **Step 1: Update `.gitignore` to ignore everything under `uploads/` except `.gitkeep`**

Replace the file contents with:

```gitignore
node_modules/
dist/
.env
.env.local
.env.prod
.DS_Store
coverage/
*.tsbuildinfo

# Uploaded user content — never commit
packages/api/uploads/*
!packages/api/uploads/avatars/
!packages/api/uploads/submissions/
packages/api/uploads/avatars/*
!packages/api/uploads/avatars/.gitkeep
packages/api/uploads/submissions/*
!packages/api/uploads/submissions/.gitkeep
```

- [ ] **Step 2: Verify the untracked JPGs are now ignored**

Run: `git status --short packages/api/uploads/`
Expected: no `??` lines for `*.jpg` under `packages/api/uploads/avatars/`.

- [ ] **Step 3: Ensure `.gitkeep` exists in both subdirs so the directories survive a clean clone**

Run:
```bash
test -f packages/api/uploads/avatars/.gitkeep || touch packages/api/uploads/avatars/.gitkeep
mkdir -p packages/api/uploads/submissions
test -f packages/api/uploads/submissions/.gitkeep || touch packages/api/uploads/submissions/.gitkeep
git add packages/api/uploads/submissions/.gitkeep
```

- [ ] **Step 4: Commit**

```bash
git add .gitignore packages/api/uploads/submissions/.gitkeep
git commit -m "chore: ignore uploaded user content, keep dirs via .gitkeep"
```

- [ ] **Step 5: (Manual, do NOT automate) Tell the user to delete the 50 untracked JPGs when they're ready**

They are not in git history — just `rm packages/api/uploads/avatars/*.jpg` when convenient. Do not run this in the plan; the user may want to inspect them first.

---

## Task 2: Magic-byte validation on uploads

Today both avatar (`routes/children.ts:113`) and submission (`routes/submissions.ts:35`) only check `mimetype.startsWith('image/')`. MIME comes from the client and is trivially forged. We add `file-type` magic-byte sniffing and allow only `image/jpeg`, `image/png`, `image/webp`.

**Files:**
- Modify: `packages/api/package.json`
- Create: `packages/api/src/lib/image-validation.ts`
- Modify: `packages/api/src/routes/submissions.ts:34-38`
- Modify: `packages/api/src/routes/children.ts:113-115`
- Test: `packages/api/src/test/submissions.test.ts`
- Test: `packages/api/src/test/children.test.ts`

- [ ] **Step 1: Install `file-type`**

Run: `npm install --workspace=packages/api file-type@^19`
Expected: `package.json` updated; `file-type` pinned under `dependencies`.

- [ ] **Step 2: Write failing test for non-image rejection on submissions**

Add to `packages/api/src/test/submissions.test.ts` inside the existing `describe('POST /api/submissions', …)`:

```ts
it('rejects files whose magic bytes are not a supported image type', async () => {
  const fakeBuffer = Buffer.from('this is not an image at all, just text');
  const { body, contentType } = buildMultipart(childId, fakeBuffer);
  const res = await app.inject({
    method: 'POST',
    url: '/api/submissions',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': contentType,
    },
    payload: body,
  });
  expect(res.statusCode).toBe(400);
  expect(res.json().error).toBe('invalid_file_type');
});
```

- [ ] **Step 3: Write failing test for non-image rejection on avatars**

Add to `packages/api/src/test/children.test.ts` (find the existing avatar upload test block, add sibling):

```ts
it('rejects avatar uploads whose magic bytes are not a supported image type', async () => {
  const fakeBuffer = Buffer.from('not-an-image');
  const boundary = 'AvatarBoundary';
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="avatar"; filename="a.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
    fakeBuffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const res = await app.inject({
    method: 'POST',
    url: `/api/children/${childId}/avatar`,
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
    payload: body,
  });
  expect(res.statusCode).toBe(400);
  expect(res.json().error).toBe('invalid_file_type');
});
```

Note: if `children.test.ts` does not already set up a `childId`, reuse the same pattern as other tests in that file for creating a child. If there is no pattern, create a child via `POST /api/children` before this test and capture the id.

- [ ] **Step 4: Run tests — confirm they fail**

Run: `npm test --workspace=packages/api -- submissions children`
Expected: both new tests FAIL with a 201 or similar success status (because the real files are bogus but the existing code still accepts anything with `image/*` MIME).

- [ ] **Step 5: Create the shared validator**

Create `packages/api/src/lib/image-validation.ts`:

```ts
import { fileTypeFromBuffer } from 'file-type';

const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function isAllowedImage(buffer: Buffer): Promise<boolean> {
  const detected = await fileTypeFromBuffer(buffer);
  return !!detected && ALLOWED_MIMES.has(detected.mime);
}
```

- [ ] **Step 6: Apply validator in `routes/submissions.ts`**

Replace the loop at `packages/api/src/routes/submissions.ts:34-38`:

```ts
// Magic-byte validation (client-provided MIME is not trusted)
for (const img of imageBuffers) {
  if (!(await isAllowedImage(img.buffer))) {
    return reply.status(400).send({ error: 'invalid_file_type' });
  }
}
```

Add the import near the top with the other local imports:

```ts
import { isAllowedImage } from '../lib/image-validation';
```

- [ ] **Step 7: Apply validator in `routes/children.ts`**

The current code is:

```ts
if (!data.mimetype.startsWith('image/')) {
  return reply.status(400).send({ error: 'invalid_file_type' });
}

const buffer = await data.toBuffer();
let filename: string;
```

Replace with:

```ts
const buffer = await data.toBuffer();
if (!(await isAllowedImage(buffer))) {
  return reply.status(400).send({ error: 'invalid_file_type' });
}

let filename: string;
```

(Buffer read moves up one block; old MIME-prefix check is deleted; the `let filename: string;` line below is unchanged.) Add import at top with the other local imports:

```ts
import { isAllowedImage } from '../lib/image-validation';
```

- [ ] **Step 8: Run failing tests — confirm they now pass**

Run: `npm test --workspace=packages/api -- submissions children`
Expected: both new tests PASS. Existing tests still pass (the `minimalJpeg` buffer in `submissions.test.ts` is a real JPEG and will pass the magic-byte check).

- [ ] **Step 9: Commit**

```bash
git add packages/api/package.json packages/api/package-lock.json \
        packages/api/src/lib/image-validation.ts \
        packages/api/src/routes/submissions.ts \
        packages/api/src/routes/children.ts \
        packages/api/src/test/submissions.test.ts \
        packages/api/src/test/children.test.ts
git commit -m "feat(api): validate uploads by magic bytes, not client MIME"
```

---

## Task 3: Rate limiting + CORS

No rate limiting exists today. `POST /api/submissions` accepts 20 MB multipart. Adding `@fastify/rate-limit` globally (modest cap) and an explicit stricter cap on the submissions route. CORS is undefined — works in dev because Vite proxies — but we should be explicit for prod.

**Files:**
- Modify: `packages/api/package.json`
- Modify: `packages/api/src/app.ts`
- Modify: `packages/api/src/routes/submissions.ts` (attach per-route rate limit)
- Test: `packages/api/src/test/submissions.test.ts`
- Create: `packages/api/src/test/cors.test.ts`

- [ ] **Step 1: Install plugins**

Run: `npm install --workspace=packages/api @fastify/rate-limit@^9 @fastify/cors@^9`
Expected: both added to `dependencies`.

- [ ] **Step 2: Write failing test — 429 after exceeding submission limit**

Add to `packages/api/src/test/submissions.test.ts`:

```ts
it('rate-limits repeated submissions with HTTP 429', async () => {
  // Give the parent enough tokens to not 402 first
  await prisma.tokenBalance.update({
    where: { parentId },
    data: { balance: 10 },
  });
  const { body, contentType } = buildMultipart(childId, minimalJpeg);

  const results: number[] = [];
  for (let i = 0; i < 7; i++) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': contentType,
      },
      payload: body,
    });
    results.push(res.statusCode);
  }
  expect(results).toContain(429);
});
```

- [ ] **Step 3: Write failing CORS preflight test**

Create `packages/api/src/test/cors.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../app';

describe('CORS', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = buildApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('responds to preflight with allowed origin header', async () => {
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/api/health',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'GET',
      },
    });
    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });
});
```

- [ ] **Step 4: Run tests — confirm they fail**

Run: `npm test --workspace=packages/api -- submissions cors`
Expected: both new tests FAIL (no rate limit registered; no CORS handler).

- [ ] **Step 5: Register CORS and global rate limit in `app.ts`**

Insert after `const app = Fastify({ logger: false });` (currently line 26):

```ts
// CORS — dev uses Vite proxy (same-origin); prod uses explicit origin(s)
const corsOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.register(import('@fastify/cors'), {
  origin: corsOrigins,
  credentials: true,
});

// Global rate limit — generous default, overridden per-route where needed
app.register(import('@fastify/rate-limit'), {
  global: true,
  max: 120,
  timeWindow: '1 minute',
});
```

Note: using dynamic `import()` keeps this ESM-compatible with the existing bundling. If the repo's tsconfig emits CJS, switch to top-of-file named imports:

```ts
import rateLimit from '@fastify/rate-limit';
import cors from '@fastify/cors';
// …
app.register(cors, { origin: corsOrigins, credentials: true });
app.register(rateLimit, { global: true, max: 120, timeWindow: '1 minute' });
```

Check `packages/api/tsconfig.json` to decide; pick whichever style the rest of the file uses for Fastify plugins (currently top-of-file named imports — use that style).

- [ ] **Step 6: Attach per-route limit to submissions**

In `packages/api/src/routes/submissions.ts`, modify the POST route:

```ts
app.post('/api/submissions', {
  preHandler: [authenticate],
  config: {
    rateLimit: { max: 6, timeWindow: '1 minute' },
  },
}, async (request, reply) => {
  // … existing handler body unchanged …
});
```

- [ ] **Step 7: Run tests — confirm they pass**

Run: `npm test --workspace=packages/api -- submissions cors`
Expected: both new tests PASS. All previously-passing tests still pass.

- [ ] **Step 8: Document the new env var in `.env.example`**

If `packages/api/.env.example` exists, add:

```
# Comma-separated list of allowed origins. Defaults to http://localhost:5173.
CORS_ORIGINS="http://localhost:5173"
```

If it doesn't exist, skip — do not create new dotfiles speculatively.

- [ ] **Step 9: Commit**

```bash
git add packages/api/package.json packages/api/package-lock.json \
        packages/api/src/app.ts \
        packages/api/src/routes/submissions.ts \
        packages/api/src/test/submissions.test.ts \
        packages/api/src/test/cors.test.ts
# Also add .env.example only if it existed
git commit -m "feat(api): add CORS and rate limiting"
```

---

## Task 4: Harden AI-call failure path

`routes/submissions.ts:84-92` deducts the token via `deductToken` (which is already a proper transaction — verified in `lib/token-helpers.ts`). On AI failure, `refundToken` is called with a silent `.catch(() => {})` (line 226). If the refund fails, the user loses a token silently with no audit record. Additionally, the OpenAI call has no wall-clock timeout, so a stuck request can hold a token and a Fastify worker indefinitely. The pre-balance check at lines 48-51 is redundant with the in-transaction check inside `deductToken`; keep it as a fast-path but don't rely on it.

**Files:**
- Modify: `packages/api/src/lib/ai-analysis.ts` (add timeout option)
- Modify: `packages/api/src/routes/submissions.ts:226` (log refund failures)
- Test: `packages/api/src/test/submissions.test.ts` (refund asserted)

- [ ] **Step 1: Write failing test — token is refunded when AI analysis throws**

Add to `packages/api/src/test/submissions.test.ts`. This test overrides the default `analyzeHomework` mock to throw, then asserts that after the request the `TokenBalance.balance` is unchanged from the starting value and that a `refund` transaction exists:

```ts
it('refunds the token and records a refund transaction when AI analysis fails', async () => {
  // Override mock for this test only
  const { analyzeHomework } = await import('../lib/ai-analysis');
  vi.mocked(analyzeHomework).mockRejectedValueOnce(new Error('boom'));

  const startingBalance = (await prisma.tokenBalance.findUniqueOrThrow({
    where: { parentId },
  })).balance;

  const { body, contentType } = buildMultipart(childId, minimalJpeg);
  const res = await app.inject({
    method: 'POST',
    url: '/api/submissions',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': contentType,
    },
    payload: body,
  });
  expect(res.statusCode).toBe(500);
  expect(res.json().error).toBe('ai_analysis_failed');

  const afterBalance = (await prisma.tokenBalance.findUniqueOrThrow({
    where: { parentId },
  })).balance;
  expect(afterBalance).toBe(startingBalance);

  const refundTx = await prisma.tokenTransaction.findFirst({
    where: { parentId, type: 'refund' },
    orderBy: { createdAt: 'desc' },
  });
  expect(refundTx).not.toBeNull();
});
```

- [ ] **Step 2: Run test — confirm it passes already (code already refunds) OR fails (if mock resets)**

Run: `npm test --workspace=packages/api -- submissions`
Expected: likely PASSES — this test codifies existing behavior so we don't regress it when changing surrounding code. If it fails, investigate before proceeding (the refund path may already be broken, which would be a separate bug to triage).

- [ ] **Step 3: Replace silent refund catch with logged catch**

In `packages/api/src/routes/submissions.ts:226`, replace:

```ts
await refundToken(app.prisma, request.parentId, submission.id, 'submission').catch(() => {});
```

with:

```ts
await refundToken(app.prisma, request.parentId, submission.id, 'submission').catch((refundErr) => {
  console.error('[submissions] token_refund_failed', {
    parentId: request.parentId,
    submissionId: submission.id,
    error: refundErr instanceof Error ? refundErr.message : String(refundErr),
  });
});
```

- [ ] **Step 4: Add a wall-clock timeout to the AI call**

Read `packages/api/src/lib/ai-analysis.ts` to find the `openai` SDK call (likely `client.chat.completions.create(…)` or `client.responses.create(…)`).

Add a 90-second timeout via `AbortSignal.timeout`. Example edit around the existing call site:

```ts
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS ?? 90_000);
// …
const response = await client.chat.completions.create(
  { /* existing params */ },
  { signal: AbortSignal.timeout(AI_TIMEOUT_MS) },
);
```

If the call signature differs, match the actual SDK surface — both OpenAI v6 chat and responses APIs accept `{ signal }` as a second request-options arg.

- [ ] **Step 5: Run the full API test suite**

Run: `npm test --workspace=packages/api`
Expected: all tests pass. The timeout is not directly tested (would need fake timers and a long-running mock), but it should not break any existing test since the mock resolves synchronously.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/routes/submissions.ts \
        packages/api/src/lib/ai-analysis.ts \
        packages/api/src/test/submissions.test.ts
git commit -m "feat(api): timeout AI calls, log refund failures, test refund path"
```

---

## Wrap-up

- [ ] **Step 1: Run the complete test suite**

Run: `npm test`
Expected: all API and web tests pass.

- [ ] **Step 2: Typecheck and lint**

Run:
```bash
npm run typecheck
npm run lint
```
Expected: zero errors. If lint finds only pre-existing issues in files you did not touch, note them but do not fix in this PR — keep scope tight.

- [ ] **Step 3: Summarize the four commits for the user**

Verify with `git log --oneline -5`. Expected four new commits on top of `main`:
1. `chore: ignore uploaded user content, keep dirs via .gitkeep`
2. `feat(api): validate uploads by magic bytes, not client MIME`
3. `feat(api): add CORS and rate limiting`
4. `feat(api): timeout AI calls, log refund failures, test refund path`

Stop before pushing or opening a PR. Ask the user whether to push, and to which branch.

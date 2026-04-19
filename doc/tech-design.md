# HomeworkAI — Technical Design

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     Client (PWA)                        │
│  ┌───────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐ │
│  │  Camera    │ │  Auth UI │ │  Token   │ │  Results  │ │
│  │  Capture   │ │  Login/  │ │  Balance │ │  History  │ │
│  │           │ │  Register│ │  & Buy   │ │  Practice │ │
│  └─────┬─────┘ └────┬─────┘ └────┬─────┘ └─────┬─────┘ │
│        │             │            │              │       │
│        └─────────────┴────────────┴──────────────┘       │
│                        │  HTTPS (REST API)               │
└────────────────────────┼─────────────────────────────────┘
                         │
┌────────────────────────┼─────────────────────────────────┐
│                 Backend API Server                       │
│                        │                                 │
│            ┌───────────┴────────────┐                    │
│            │  Auth Middleware (JWT) │                    │
│            └───────────┬────────────┘                    │
│                        │                                 │
│            ┌───────────┴────────────┐                    │
│            │  Token Quota Middleware│  ← checks DB       │
│            │  (check balance ≥ 1)  │    before every     │
│            └───────────┬────────────┘    AI request       │
│                        │                                 │
│  ┌───────────┐ ┌───────┴──────┐ ┌─────────────────────┐ │
│  │  Auth      │ │  Homework    │ │  Practice / Token   │ │
│  │  Service   │ │  Service     │ │  Purchase Service   │ │
│  └─────┬─────┘ └──────┬───────┘ └────────┬────────────┘ │
│        │               │                  │              │
│        │        ┌──────┴───────┐          │              │
│        │        │  AI Gateway  │          │              │
│        │        │ (Prompt Eng) │          │              │
│        │        └──────┬───────┘          │              │
└────────┼───────────────┼──────────────────┼──────────────┘
         │               │                  │
    ┌────┴────┐   ┌──────┴───────┐   ┌─────┴─────┐
    │   DB    │   │  OpenAI /    │   │  Object   │
    │ (Postgres)│ │  Gemini      │   │  Storage  │
    │         │   └──────────────┘   │  (S3/R2)  │
    │ - users │                      └───────────┘
    │ - tokens│
    │ - config│
    └─────────┘
```

---

## 2. Technology Stack

| Layer            | Technology                              | Rationale                                              |
| ---------------- | --------------------------------------- | ------------------------------------------------------ |
| **Frontend**     | React 18 + TypeScript + Vite            | Mature PWA ecosystem, fast builds                      |
| **PWA**          | Workbox (service worker), Web App Manifest | Reliable caching, Add-to-Home-Screen on iOS & Android |
| **UI Framework** | Tailwind CSS + Headless UI              | Mobile-first responsive design, easy print styles      |
| **Camera**       | `navigator.mediaDevices.getUserMedia()` + `<input type="file" capture="environment">` as fallback | Cross-platform camera access |
| **Backend**      | Node.js (Express or Fastify) + TypeScript | Shared language with frontend, async-friendly         |
| **Database**     | PostgreSQL 16                           | Relational integrity, JSONB for flexible AI responses  |
| **ORM**          | Prisma                                  | Type-safe queries, easy migrations                     |
| **Auth**         | JWT (access + refresh tokens)           | Stateless, mobile-friendly                             |
| **Object Store** | AWS S3 / Cloudflare R2                  | Homework photo storage                                 |
| **AI Providers** | OpenAI GPT-4o (vision), Google Gemini 2.0 Flash (vision) | Multi-provider with vision capability for image analysis; DeepSeek does not currently support image input |
| **Print**        | CSS `@media print` + `@page` rules      | Native browser print, no extra dependencies            |
| **CI/CD**        | GitHub Actions → Coolify webhook         | Push-to-deploy via Coolify's GitHub integration        |
| **Image Processing** | Sharp (Node.js)                         | Server-side image resize, rotate, compress before AI call |
| **Hosting**      | Coolify (self-hosted PaaS)              | Hosts frontend, backend, and Postgres on your own VPS; Docker-based deployments with built-in SSL, reverse proxy, and zero-downtime deploys |
| **Monitoring**   | Sentry (errors) + Coolify dashboard (metrics) | Error tracking, container health, resource usage  |

---

## 3. Data Model (PostgreSQL)

### 3.1 ER Diagram

```
system_config (singleton defaults: free_tokens = 3, token packages, etc.)

parents ──── token_balances (1:1)
   │
   ├──< token_transactions (purchase / deduction / grant log)
   │
   └──< children ──< submissions ──< submission_images (1–10, ordered)
                             │
                             ├──< wrong_answers
                             └──< ai_responses

children ──< practice_sessions ──< practice_questions
```

### 3.2 Table Definitions

```sql
-- Parents (app users)
CREATE TABLE parents (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name          VARCHAR(100) NOT NULL,
    phone         VARCHAR(20),
    locale        VARCHAR(10) DEFAULT 'en',  -- feedback language preference
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- System-wide configuration (admin-managed defaults)
CREATE TABLE system_config (
    key           VARCHAR(100) PRIMARY KEY,
    value         JSONB NOT NULL,
    description   TEXT,
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default config values
INSERT INTO system_config (key, value, description) VALUES
  ('free_tokens_on_register', '3', 'Number of free AI tokens granted to new users'),
  ('token_packages', '[
    {"id": "starter",  "tokens": 10,  "price_cents": 199,  "currency": "USD"},
    {"id": "standard", "tokens": 50,  "price_cents": 799,  "currency": "USD"},
    {"id": "bulk",     "tokens": 200, "price_cents": 2499, "currency": "USD"}
  ]', 'Available token purchase packages'),
  ('tokens_per_submission', '1', 'Tokens consumed per homework scan'),
  ('tokens_per_practice',  '1', 'Tokens consumed per practice generation');

-- Token balance per parent (1:1 with parents)
CREATE TABLE token_balances (
    parent_id     UUID PRIMARY KEY REFERENCES parents(id) ON DELETE CASCADE,
    balance       INT NOT NULL DEFAULT 0 CHECK (balance >= 0),
    total_earned  INT NOT NULL DEFAULT 0,  -- lifetime tokens received (free + purchased)
    total_spent   INT NOT NULL DEFAULT 0,  -- lifetime tokens consumed
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Token transaction log (immutable audit trail)
CREATE TABLE token_transactions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id     UUID NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
    type          VARCHAR(20) NOT NULL,      -- grant | purchase | deduct | refund
    amount        INT NOT NULL,              -- positive = credit, negative = debit
    balance_after INT NOT NULL,              -- balance snapshot after this transaction
    reference_id  UUID,                      -- links to submission_id or practice_session_id
    reference_type VARCHAR(30),              -- submission | practice | purchase | registration
    description   TEXT,                      -- human-readable reason
    payment_id    VARCHAR(255),              -- external payment provider ID (Stripe, etc.)
    created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_token_tx_parent ON token_transactions(parent_id);
CREATE INDEX idx_token_tx_created ON token_transactions(parent_id, created_at DESC);

-- Supported subjects (Singapore primary curriculum)
CREATE TYPE subject_enum AS ENUM ('math', 'english', 'science', 'chinese', 'higher_chinese');

-- Children profiles (Singapore primary school P1–P6)
CREATE TABLE children (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id  UUID NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
    name       VARCHAR(100) NOT NULL,
    grade      SMALLINT NOT NULL CHECK (grade BETWEEN 1 AND 6),  -- P1–P6
    avatar_url VARCHAR(500),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_children_parent ON children(parent_id);

-- Homework submissions (one per batch; a batch contains 1–10 photos)
CREATE TABLE submissions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_id        UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    detected_subject subject_enum,            -- auto-detected by AI from the photo content
    image_count     SMALLINT NOT NULL CHECK (image_count BETWEEN 1 AND 10),
    status          VARCHAR(20) DEFAULT 'pending',  -- pending | processing | completed | failed
    error_message   TEXT,                     -- failure reason if status = failed
    ai_provider     VARCHAR(30),              -- openai | gemini
    retry_count     SMALLINT DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_submissions_child ON submissions(child_id);
CREATE INDEX idx_submissions_status ON submissions(status);

-- Individual images within a submission (ordered)
CREATE TABLE submission_images (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id   UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    image_url       VARCHAR(500) NOT NULL,
    image_hash      VARCHAR(64),              -- SHA-256 for deduplication
    sort_order      SMALLINT NOT NULL,        -- 1-based, set by parent's ordering
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (submission_id, sort_order)
);
CREATE INDEX idx_sub_images_submission ON submission_images(submission_id);

-- AI analysis responses
CREATE TABLE ai_responses (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id         UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    raw_response          JSONB NOT NULL,          -- full AI response
    summary               TEXT,                    -- human-readable summary
    total_questions       INT,
    correct_count         INT,
    partial_correct_count INT,
    wrong_count           INT,
    model_used            VARCHAR(50),
    tokens_used           INT,
    cost_usd              NUMERIC(8,5),            -- estimated cost for this call
    latency_ms            INT,
    created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Wrong / partially correct answers only (correct answers are NOT stored)
CREATE TABLE wrong_answers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id   UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    child_id        UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    subject         subject_enum NOT NULL,    -- AI-detected subject
    question_number SMALLINT NOT NULL,       -- global sequence number across all images
    image_order     SMALLINT NOT NULL,       -- which photo this question came from (1-based)
    question_text   TEXT NOT NULL,            -- the original question
    child_answer    TEXT,                     -- what the child wrote
    correct_answer  TEXT NOT NULL,            -- correct answer
    status          VARCHAR(20) NOT NULL,     -- wrong | partial_correct
    explanation     TEXT NOT NULL,            -- AI explanation of why it's wrong / partially correct
    topic           VARCHAR(100),            -- e.g., "addition", "fractions", "grammar"
    difficulty      VARCHAR(20),             -- easy | medium | hard
    resolved_at     TIMESTAMPTZ,             -- NULL = active (unresolved); set when parent marks as resolved
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_wrong_answers_child ON wrong_answers(child_id);
CREATE INDEX idx_wrong_answers_subject ON wrong_answers(child_id, subject);
CREATE INDEX idx_wrong_answers_topic ON wrong_answers(child_id, topic);
CREATE INDEX idx_wrong_answers_active ON wrong_answers(child_id, subject) WHERE resolved_at IS NULL;

-- Practice sessions
CREATE TABLE practice_sessions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_id          UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    subject           subject_enum NOT NULL,
    source_type       VARCHAR(10) NOT NULL DEFAULT 'active', -- 'active' or 'resolved'
    source_wrong_ids  UUID[] NOT NULL,         -- snapshot of wrong_answer IDs used as source
    multiplier        SMALLINT NOT NULL DEFAULT 2, -- questions per source (default 2)
    total_questions   INT NOT NULL,            -- source count × multiplier
    generated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Generated practice questions
CREATE TABLE practice_questions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id        UUID NOT NULL REFERENCES practice_sessions(id) ON DELETE CASCADE,
    source_wrong_id   UUID REFERENCES wrong_answers(id) ON DELETE SET NULL,  -- NULL if source was deleted
    question          TEXT NOT NULL,
    answer            TEXT NOT NULL,
    explanation       TEXT,
    topic             VARCHAR(100),
    sort_order        SMALLINT,
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Weakness reports (AI-generated analysis per subject)
CREATE TABLE weakness_reports (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_id          UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    subject           subject_enum NOT NULL,
    source_wrong_ids  UUID[] NOT NULL,           -- snapshot of wrong_answer IDs analyzed
    topic_groups      JSONB NOT NULL,            -- grouped questions by topic with counts
    weaknesses        JSONB NOT NULL,            -- ranked weakness analysis from AI
    summary           TEXT NOT NULL,             -- AI-written natural-language summary
    total_questions   INT NOT NULL,
    total_topics      INT NOT NULL,
    model_used        VARCHAR(50),
    cost_usd          NUMERIC(8,5),
    created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_weakness_reports_child ON weakness_reports(child_id, subject);
```

---

## 4. API Design (REST)

### 4.1 Authentication

| Method | Endpoint               | Description             |
| ------ | ---------------------- | ----------------------- |
| POST   | `/api/auth/register`   | Register new parent (grants free tokens from `system_config`) |
| POST   | `/api/auth/login`      | Login → JWT tokens + current token balance |
| POST   | `/api/auth/refresh`    | Refresh access token    |

### 4.2 Tokens & Purchases

| Method | Endpoint                         | Description                                             |
| ------ | -------------------------------- | ------------------------------------------------------- |
| GET    | `/api/tokens/balance`            | Get current token balance and lifetime stats            |
| GET    | `/api/tokens/packages`           | List available token packages (from `system_config`)    |
| POST   | `/api/tokens/purchase`           | Purchase a token package (creates payment intent)       |
| POST   | `/api/tokens/webhook`            | Payment provider webhook (confirms purchase, credits tokens) |
| GET    | `/api/tokens/transactions?page=&limit=` | Transaction history (paginated)                  |

### 4.3 Children

| Method | Endpoint                   | Description                |
| ------ | -------------------------- | -------------------------- |
| GET    | `/api/children`            | List parent's children     |
| POST   | `/api/children`            | Add a child + grade        |
| PATCH  | `/api/children/:id`        | Update child info / grade  |
| DELETE | `/api/children/:id`        | Remove child profile       |

### 4.4 Homework Submission

| Method | Endpoint                       | Description                           |
| ------ | ------------------------------ | ------------------------------------- |
| POST   | `/api/submissions`             | Upload 1–10 photos (ordered) → start AI analysis. Consumes 1 token per submission regardless of photo count. |
| GET    | `/api/submissions/:id`         | Get submission status, images, and AI result (numbered, color-coded blocks) |
| GET    | `/api/submissions?childId=&page=&limit=` | List submissions for a child (paginated) |

**POST `/api/submissions`** request body (`multipart/form-data`):

```
childId:       UUID (required)
images[]:      File[] (1–10 files, order preserved from array index)
```

> The subject is **not** sent by the client. The AI auto-detects the subject from the photo content and returns it in the response.

### 4.5 Wrong Answers

| Method | Endpoint                             | Description                        |
| ------ | ------------------------------------ | ---------------------------------- |
| GET    | `/api/wrong-answers?childId=&subject=&resolved=false&topic=&page=&limit=` | List wrong answers (filterable; `resolved=false` for active, `resolved=true` for resolved) |
| GET    | `/api/wrong-answers/summary?childId=` | Get per-subject active (unresolved) error counts (used by dashboard blocks) |
| GET    | `/api/wrong-answers/topics?childId=&subject=` | Get topic breakdown within a subject |
| GET    | `/api/wrong-answers/stats?childId=`  | Get aggregate stats (total, by week, improvement trend) |
| PATCH  | `/api/wrong-answers/:id/resolve`     | Mark a wrong answer as resolved (sets `resolved_at`) |
| PATCH  | `/api/wrong-answers/:id/unresolve`   | Move a resolved answer back to active (clears `resolved_at`) |
| DELETE | `/api/wrong-answers/:id`             | **Hard delete** — permanently removes the question from the database. Cannot be undone. |

### 4.6 Practice

| Method | Endpoint                          | Description                              |
| ------ | --------------------------------- | ---------------------------------------- |
| POST   | `/api/practice/generate`          | Generate practice for all questions in a subject (active or resolved). Default ×2 per question. Consumes 1 token. |
| GET    | `/api/practice/sessions?childId=&subject=&page=&limit=` | List practice sessions (paginated) |
| GET    | `/api/practice/sessions/:id`      | Get session with questions               |
| GET    | `/api/practice/sessions/:id/print`| Get print-optimized HTML (A4 format)     |

**POST `/api/practice/generate`** request body:

```json
{
  "childId": "uuid",
  "subject": "math",
  "source": "active",
  "multiplier": 2
}
```

| Field        | Type   | Required | Default    | Description |
| ------------ | ------ | -------- | ---------- | ----------- |
| `childId`    | UUID   | Yes      | —          | Which child |
| `subject`    | enum   | Yes      | —          | Which subject's questions to use |
| `source`     | string | Yes      | —          | `"active"` = unresolved questions, `"resolved"` = resolved questions |
| `multiplier` | number | No       | `2`        | How many similar questions to generate per source question |

The backend fetches **all** wrong answers matching `childId + subject + source` and generates `count × multiplier` practice questions. Example: 5 active Math questions × default 2 = 10 practice questions.

### 4.7 Weakness Reports

| Method | Endpoint                          | Description                              |
| ------ | --------------------------------- | ---------------------------------------- |
| POST   | `/api/reports/weakness`           | Generate a weakness report for a subject. Groups wrong/partial questions by topic, ranks weaknesses. Consumes 1 token. |
| GET    | `/api/reports/weakness?childId=&subject=` | Get the latest weakness report for a subject |
| GET    | `/api/reports/weakness/:id`       | Get a specific report by ID              |
| POST   | `/api/reports/weakness/:id/practice` | Generate practice questions targeting the weaknesses identified in this report. Consumes 1 token. |

**POST `/api/reports/weakness`** request body:

```json
{
  "childId": "uuid",
  "subject": "math"
}
```

The backend fetches **all** wrong/partial answers (both active and resolved) for the given `childId + subject`, sends them to the AI for analysis, and returns a structured weakness report.

**Response:**

```json
{
  "id": "report-uuid",
  "childId": "uuid",
  "subject": "math",
  "summary": "Wei Ming struggles most with Fractions (5 errors) and Word Problems (3 errors). Addition and subtraction are improving with only 1 recent error each.",
  "totalQuestions": 12,
  "totalTopics": 4,
  "topicGroups": [
    {
      "topic": "Fractions",
      "wrongCount": 3,
      "partialCount": 2,
      "totalErrors": 5,
      "questions": [
        {
          "id": "uuid",
          "questionText": "3/4 + 1/2 = ?",
          "childAnswer": "4/6",
          "correctAnswer": "5/4",
          "status": "wrong"
        }
      ]
    },
    {
      "topic": "Word Problems",
      "wrongCount": 2,
      "partialCount": 1,
      "totalErrors": 3,
      "questions": [...]
    }
  ],
  "weaknesses": [
    {
      "rank": 1,
      "topic": "Fractions",
      "severity": "high",
      "errorCount": 5,
      "pattern": "Consistently adds numerators and denominators separately instead of finding common denominators",
      "suggestion": "Practice finding common denominators before adding fractions"
    },
    {
      "rank": 2,
      "topic": "Word Problems",
      "severity": "medium",
      "errorCount": 3,
      "pattern": "Misidentifies the operation needed from word problem context",
      "suggestion": "Practice identifying keywords that indicate addition, subtraction, multiplication"
    }
  ],
  "tokenBalance": 11
}
```

**POST `/api/reports/weakness/:id/practice`** request body:

```json
{
  "multiplier": 2
}
```

This generates practice questions focused on the weakest topics identified in the report. The AI weights more questions toward higher-severity weaknesses. Uses the same practice session structure (returns a `practice_session` with questions).

### 4.8 Common Response Envelope

All list endpoints return a standard paginated envelope:

```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 87,
    "totalPages": 5
  }
}
```

---

## 5. Core Flows

### 5.1 Homework Check Flow (Multi-Photo)

```
Parent                   PWA                       Backend                    AI Provider
  │                       │                          │                           │
  │  Take / select photos │                          │                           │
  │  (1–10, reorder)      │                          │                           │
  │──────────────────────>│                          │                           │
  │                       │  Validate each image      │                           │
  │                       │  (quality, size, count)   │                           │
  │                       │                          │                           │
  │  Confirm order & send │                          │                           │
  │──────────────────────>│                          │                           │
  │                       │  POST /submissions        │                           │
  │                       │  multipart/form-data:     │                           │
  │                       │  childId + images[0..N]   │                           │
  │                       │──────────────────────────>│                           │
  │                       │                          │                           │
  │                       │                          │  1. Validate JWT           │
  │                       │                          │  2. Validate image count   │
  │                       │                          │     (1 ≤ N ≤ 10)          │
  │                       │                          │  3. Check token_balances   │
  │                       │                          │     balance ≥ 1?           │
  │                       │                          │                           │
  │                       │                          │  ── IF balance = 0 ─────  │
  │                       │  403 + "Insufficient     │                           │
  │                       │  tokens."                 │                           │
  │                       │<──────────────────────────│                           │
  │  Show buy-tokens UI   │                          │                           │
  │<──────────────────────│                          │                           │
  │                       │                          │                           │
  │                       │                          │  ── IF balance ≥ 1 ─────  │
  │                       │                          │  4. Deduct 1 token (DB)   │
  │                       │                          │  5. Log token_transaction  │
  │                       │                          │  6. Upload all images to  │
  │                       │                          │     S3 (preserve order)   │
  │                       │                          │  7. Save submission +     │
  │                       │                          │     submission_images     │
  │                       │                          │     with sort_order       │
  │                       │                          │  8. Build prompt with     │
  │                       │                          │     all images in order:  │
  │                       │                          │     - Grade: {grade}      │
  │                       │                          │     - Subject: {subject}  │
  │                       │                          │     - Images: [1..N]      │
  │                       │                          │                           │
  │                       │                          │  POST /chat/completions    │
  │                       │                          │  (multi-image message)     │
  │                       │                          │──────────────────────────>│
  │                       │                          │                           │
  │                       │                          │  AI response (JSON)        │
  │                       │                          │  questions numbered        │
  │                       │                          │  continuously across       │
  │                       │                          │  all images               │
  │                       │                          │<──────────────────────────│
  │                       │                          │                           │
  │                       │                          │  9. Parse & validate      │
  │                       │                          │ 10. Save ai_responses     │
  │                       │                          │ 11. Save wrong_answers    │
  │                       │                          │     (wrong + partial)     │
  │                       │                          │                           │
  │                       │  Numbered result blocks   │                           │
  │                       │  + color codes + balance  │                           │
  │                       │<──────────────────────────│                           │
  │  View color-coded     │                          │                           │
  │  result blocks        │                          │                           │
  │<──────────────────────│                          │                           │
```

> **Token cost:** 1 token per submission regardless of how many photos (1–10) are included.
> **Token deduction timing:** Deducted *before* calling the AI provider. Refunded if the AI call fails after all retries.

### 5.2 Registration Flow (Token Grant)

```
Parent submits registration form
  → POST /api/auth/register { email, password, name }
  → Backend creates parent record
  → Read system_config('free_tokens_on_register') → e.g. 3
  → Create token_balances { parent_id, balance: 3, total_earned: 3 }
  → Create token_transactions { type: 'grant', amount: 3, 
      reference_type: 'registration', description: 'Free tokens on sign-up' }
  → Return JWT + { balance: 3 }
```

### 5.3 Token Purchase Flow

```
Parent                   PWA                    Backend                 Payment Provider
  │                       │                       │                           │
  │  Tap "Buy Tokens"     │                       │                           │
  │──────────────────────>│                       │                           │
  │                       │  GET /tokens/packages  │                           │
  │                       │──────────────────────>│                           │
  │                       │  [starter, standard,  │                           │
  │                       │   bulk]                │                           │
  │                       │<──────────────────────│                           │
  │  Select package       │                       │                           │
  │──────────────────────>│                       │                           │
  │                       │  POST /tokens/purchase │                           │
  │                       │  { packageId }         │                           │
  │                       │──────────────────────>│                           │
  │                       │                       │  Create payment intent    │
  │                       │                       │──────────────────────────>│
  │                       │                       │  client_secret            │
  │                       │                       │<──────────────────────────│
  │                       │  { clientSecret }      │                           │
  │                       │<──────────────────────│                           │
  │  Complete payment     │                       │                           │
  │──────────────────────>│                       │                           │
  │                       │  Confirm with Stripe   │                           │
  │                       │──────────────────────────────────────────────────>│
  │                       │                       │                           │
  │                       │                       │  POST /tokens/webhook     │
  │                       │                       │<──────────────────────────│
  │                       │                       │  Verify webhook signature │
  │                       │                       │  Add tokens to balance    │
  │                       │                       │  Log token_transaction    │
  │                       │                       │    { type: 'purchase' }   │
  │                       │                       │                           │
  │                       │  Balance updated       │                           │
  │                       │<──────────────────────│                           │
  │  See new balance      │                       │                           │
  │<──────────────────────│                       │                           │
```

### 5.4 Practice Generation Flow (Generate All × Multiplier)

```
Parent taps a subject block (e.g., Math)
  → Sees Active tab with 5 wrong/partial questions
  → Clicks "Generate Practice" button (includes ALL 5 questions, default ×2)
  → Optionally adjusts multiplier via dropdown (e.g., keeps ×2)
  → UI shows: "Generate 10 practice questions (5 × 2)? Costs 1 token."
  → Parent confirms
  → POST /api/practice/generate { childId, subject: "math", source: "active", multiplier: 2 }
  → Token quota middleware checks token_balances.balance ≥ 1
  → If insufficient: return 403 with buy-tokens message
  → Deduct 1 token, log transaction
  → Backend fetches ALL wrong_answers WHERE child_id = ? AND subject = 'math' AND resolved_at IS NULL
  → Builds prompt: "For each of these 5 questions, generate 2 similar questions..."
  → AI generates 10 questions (2 variations per source)
  → Save practice_session { subject: 'math', source_wrong_ids: [...5], multiplier: 2, total: 10 }
  → Save 10 practice_questions (each linked to its source_wrong_id)
  → Return session with questions + updated token balance
  → Parent views results → can print as A4 worksheet

Same flow works for Resolved tab:
  → POST /api/practice/generate { childId, subject: "math", source: "resolved", multiplier: 2 }
  → Backend fetches WHERE resolved_at IS NOT NULL instead
```

### 5.5 Weakness Report & Weakness Practice Flow

```
Parent taps a subject block (e.g., Math)
  → Clicks "Weakness Report" button
  → POST /api/reports/weakness { childId, subject: "math" }
  → Token quota middleware checks token_balances.balance ≥ 1
  → Deduct 1 token, log transaction
  → Backend fetches ALL wrong_answers WHERE child_id = ? AND subject = 'math'
    (both active and resolved — complete picture)
  → Builds weakness analysis prompt with all questions
  → AI groups questions by topic, identifies patterns, ranks weaknesses
  → Save weakness_report to DB
  → Return report with grouped topics, ranked weaknesses, summary
  → Parent views the Weakness Report page

To generate weakness-focused practice:
  → Parent clicks "Practice Weaknesses" on the report page
  → POST /api/reports/weakness/:reportId/practice { multiplier: 2 }
  → Token quota middleware checks token_balances.balance ≥ 1
  → Deduct 1 token, log transaction
  → Backend reads the weakness ranking from the report
  → Builds prompt: AI generates more questions for weaker topics
    (high severity: multiplier+1, medium: multiplier, low: multiplier−1)
  → Save practice_session + practice_questions
  → Return session with questions + updated token balance
  → Parent views results → can print as A4 worksheet
```

---

## 6. AI Integration

### 6.0 Token Quota Middleware

Every API route that triggers an AI call is guarded by the token quota middleware. The check and deduction happen in a single database transaction to prevent race conditions.

```typescript
async function tokenQuotaMiddleware(req: Request, res: Response, next: NextFunction) {
  const parentId = req.user.id;
  const costKey = req.path.includes('submissions')
    ? 'tokens_per_submission'
    : 'tokens_per_practice';

  const cost = await getSystemConfig<number>(costKey); // e.g. 1

  const result = await prisma.$transaction(async (tx) => {
    const balance = await tx.tokenBalances.findUnique({
      where: { parent_id: parentId },
    });

    if (!balance || balance.balance < cost) {
      return { allowed: false, balance: balance?.balance ?? 0 };
    }

    const updated = await tx.tokenBalances.update({
      where: { parent_id: parentId },
      data: {
        balance: { decrement: cost },
        total_spent: { increment: cost },
        updated_at: new Date(),
      },
    });

    await tx.tokenTransactions.create({
      data: {
        parent_id: parentId,
        type: 'deduct',
        amount: -cost,
        balance_after: updated.balance,
        reference_type: costKey === 'tokens_per_submission' ? 'submission' : 'practice',
        description: `AI request: ${costKey}`,
      },
    });

    return { allowed: true, balance: updated.balance };
  });

  if (!result.allowed) {
    return res.status(403).json({
      error: 'INSUFFICIENT_TOKENS',
      message: 'You have no AI tokens remaining. Please purchase more to continue.',
      balance: result.balance,
      purchaseUrl: '/tokens/packages',
    });
  }

  req.tokenBalance = result.balance;
  next();
}
```

**Routes guarded by this middleware:**
- `POST /api/submissions` (homework scan)
- `POST /api/practice/generate` (practice question generation)

**Routes NOT guarded** (free to use):
- All `GET` endpoints (viewing history, results, balance)
- Auth endpoints (register, login, refresh)
- Token purchase endpoints
- Children CRUD

### 6.1 Prompt Template — Homework Check (Multi-Image, Auto-Subject)

```
You are an experienced Singapore primary school teacher. A Primary {grade} 
student has completed their homework. I am providing {image_count} photos 
of the homework pages in order (Image 1 through Image {image_count}).

First, determine which subject this homework belongs to. It must be one of:
"math", "english", "science", "chinese", "higher_chinese".

Then analyze ALL questions across ALL images. Number the questions with a 
single continuous sequence starting from 1, in the order they appear 
(Image 1 first, then Image 2, etc.).

For each question:
1. Identify the question
2. Identify the student's answer
3. Determine the status: "correct", "partial_correct", or "wrong"
   - "partial_correct" means the approach is right but the final answer 
     has an error, or some steps are correct but incomplete
4. Provide the correct answer and a clear, age-appropriate explanation 
   suitable for a Primary {grade} student, aligned with the Singapore 
   MOE syllabus

Respond in the following JSON format:
{
  "detected_subject": "math | english | science | chinese | higher_chinese",
  "questions": [
    {
      "number": 1,
      "image_order": 1,
      "question_text": "...",
      "student_answer": "...",
      "correct_answer": "...",
      "status": "correct | partial_correct | wrong",
      "explanation": "...",
      "topic": "...",
      "difficulty": "easy|medium|hard"
    }
  ],
  "summary": "...",
  "total_questions": N,
  "correct_count": N,
  "partial_correct_count": N,
  "wrong_count": N
}
```

### 6.2 Prompt Template — Practice Generation (All Questions × Multiplier)

The backend automatically fetches all questions in the subject (active or resolved) and sends them to the AI. Default multiplier is **2**.

```
You are an experienced Singapore primary school teacher.

A Primary {grade} student studying {subject} got the following 
{source_count} questions wrong or partially wrong. Generate practice 
questions so the student can strengthen these weak areas.

{for each source question:}
---
Source Question #{n}:
  Question: {question_text}
  Student's Answer: {child_answer}
  Correct Answer: {correct_answer}
  Topic: {topic}
  Status: {wrong | partial_correct}
---

For EACH of the {source_count} source questions above, generate exactly 
{multiplier} similar-but-different practice questions. The new questions 
should:
- Test the same concept/topic as the source question
- Use different numbers, words, or scenarios
- Be at the same difficulty level, appropriate for Primary {grade}
- Be aligned with the Singapore MOE syllabus

Total questions to generate: {source_count} × {multiplier} = {total}.

Respond in JSON:
{
  "groups": [
    {
      "sourceQuestionNumber": 1,
      "sourceTopic": "addition",
      "questions": [
        {
          "question": "...",
          "answer": "...",
          "explanation": "...",
          "topic": "..."
        }
      ]
    }
  ]
}
```

The response is grouped by source question so that related practice questions appear together in the printed worksheet. The default multiplier of 2 keeps worksheets manageable while giving the student enough practice per weak area.

### 6.3 Prompt Template — Weakness Report

The backend sends **all** wrong/partial answers for a subject (both active and resolved) and asks the AI to analyze patterns.

```
You are an experienced Singapore primary school teacher analyzing a 
Primary {grade} student's mistakes in {subject}.

Below are {total_count} questions the student got wrong or partially wrong:

{for each question:}
---
Question #{n}:
  Question: {question_text}
  Student's Answer: {child_answer}
  Correct Answer: {correct_answer}
  Topic: {topic}
  Status: {wrong | partial_correct}
---

Analyze these mistakes and:
1. Group the questions by topic
2. For each topic, count the number of wrong and partially correct answers
3. Identify patterns in the student's mistakes (e.g., common misconceptions, 
   repeated error types)
4. Rank the topics from weakest to strongest based on error frequency and 
   severity (wrong counts more than partial_correct)
5. For each weakness, provide a specific suggestion for improvement aligned 
   with the Singapore MOE syllabus for Primary {grade} {subject}
6. Write a brief overall summary (2-3 sentences) of the student's strengths 
   and weaknesses

Respond in JSON:
{
  "summary": "Overall natural-language summary...",
  "topicGroups": [
    {
      "topic": "Fractions",
      "wrongCount": 3,
      "partialCount": 2,
      "totalErrors": 5,
      "questionNumbers": [1, 4, 7, 9, 11]
    }
  ],
  "weaknesses": [
    {
      "rank": 1,
      "topic": "Fractions",
      "severity": "high | medium | low",
      "errorCount": 5,
      "pattern": "Description of the common mistake pattern...",
      "suggestion": "Specific improvement suggestion..."
    }
  ]
}
```

### 6.4 Prompt Template — Weakness-Focused Practice Generation

When the parent clicks "Practice Weaknesses" on a report, the backend generates practice questions weighted toward the weakest topics.

```
You are an experienced Singapore primary school teacher.

A Primary {grade} student studying {subject} has the following weaknesses 
(ranked from most severe to least):

{for each weakness:}
---
Weakness #{rank} (severity: {severity}):
  Topic: {topic}
  Error count: {errorCount}
  Pattern: {pattern}
  Example wrong answers:
    {sample questions from this topic}
---

Generate practice questions to strengthen these weak areas. 
Allocate more questions to higher-severity weaknesses:
- high severity: {multiplier + 1} questions per topic
- medium severity: {multiplier} questions per topic
- low severity: {multiplier - 1} questions per topic (minimum 1)

Total approximate questions: {estimated_total}.

All questions must be:
- Appropriate for Primary {grade} {subject}
- Aligned with the Singapore MOE syllabus
- Similar in style to school exam questions

Respond in JSON:
{
  "groups": [
    {
      "topic": "Fractions",
      "severity": "high",
      "questions": [
        {
          "question": "...",
          "answer": "...",
          "explanation": "...",
          "topic": "..."
        }
      ]
    }
  ]
}
```

### 6.5 AI Gateway Design

```typescript
interface AIProvider {
  name: string;
  supportsVision: boolean;
  analyzeHomework(images: OrderedImage[], prompt: string): Promise<AIResponse>;
  generateQuestions(prompt: string): Promise<PracticeResponse>;
  analyzeWeaknesses(prompt: string): Promise<WeaknessReport>;
  generateWeaknessPractice(prompt: string): Promise<PracticeResponse>;
}

interface OrderedImage {
  buffer: Buffer;
  sortOrder: number;  // 1-based, matches parent's chosen order
}

class OpenAIProvider implements AIProvider {
  name = 'openai';
  supportsVision = true;
  // Uses GPT-4o with vision for homework analysis
}

class GeminiProvider implements AIProvider {
  name = 'gemini';
  supportsVision = true;
  // Uses Gemini 2.0 Flash for cost-effective vision analysis
}

class AIGateway {
  private providers: Map<string, AIProvider>;
  private readonly MAX_RETRIES = 2;
  private readonly TIMEOUT_MS = 30_000;

  async analyzeHomework(
    images: OrderedImage[],
    grade: number,               // P1–P6
    preferredProvider?: string   // subject is auto-detected by AI
  ): Promise<AIResponse> {
    const provider = this.selectVisionProvider(preferredProvider);
    const prompt = this.buildHomeworkPrompt(grade, images.length);
    const sorted = images.sort((a, b) => a.sortOrder - b.sortOrder);

    try {
      const raw = await this.callWithRetry(
        () => provider.analyzeHomework(sorted, prompt)
      );
      return this.validateAndParseResponse(raw);
    } catch (err) {
      const fallback = this.getFallbackProvider(provider.name);
      if (fallback) {
        return this.callWithRetry(
          () => fallback.analyzeHomework(sorted, prompt)
        );
      }
      throw err;
    }
  }

  private async callWithRetry<T>(
    fn: () => Promise<T>,
    retries = this.MAX_RETRIES
  ): Promise<T> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await Promise.race([
          fn(),
          this.timeout(this.TIMEOUT_MS)
        ]);
      } catch (err) {
        if (attempt === retries) throw err;
        await this.delay(1000 * 2 ** attempt); // exponential backoff
      }
    }
    throw new Error('Unreachable');
  }

  private validateAndParseResponse(raw: unknown): AIResponse {
    // Validate JSON structure matches expected schema
    // Throw ParseError if AI returned malformed response
  }
}
```

### 6.6 Image Preprocessing Pipeline

Before sending to AI, images go through a server-side preprocessing pipeline:

```typescript
import sharp from 'sharp';

async function preprocessImage(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate()           // auto-rotate based on EXIF orientation
    .resize(1920, null, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  // Target: < 2 MB output for optimal AI processing
}
```

### 6.7 Cost Tracking

Every AI call logs estimated cost to `ai_responses.cost_usd` for monitoring:

| Provider    | Model             | Estimated Cost/Scan |
| ----------- | ----------------- | ------------------- |
| OpenAI      | GPT-4o            | ~$0.03–0.05         |
| Google      | Gemini 2.0 Flash  | ~$0.005–0.01        |

---

## 7. PWA Configuration

### 7.1 Web App Manifest

```json
{
  "name": "HomeworkAI",
  "short_name": "HomeworkAI",
  "description": "AI-powered homework checker for parents",
  "start_url": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#ffffff",
  "theme_color": "#4F46E5",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

### 7.2 Camera & Photo Selection

The user can add photos via two methods, mix-and-match within the same submission:

```typescript
export async function capturePhoto(): Promise<Blob> {
  // Strategy 1: MediaDevices API (preferred — gives live viewfinder)
  if (navigator.mediaDevices?.getUserMedia) {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1920 } }
    });
    // Render to <video>, user taps capture, grab frame to <canvas>
    // Convert canvas to blob: canvas.toBlob(resolve, 'image/jpeg', 0.9)
    stream.getTracks().forEach(t => t.stop());
  }
  
  // Strategy 2: File input fallback (iOS Safari < 16.4 or permission denied)
  // <input type="file" accept="image/*" capture="environment">
}

export function selectPhotosFromGallery(): Promise<Blob[]> {
  // <input type="file" accept="image/*" multiple>
  // User selects up to 10 photos from gallery
}

export function validateImageQuality(blob: Blob): ValidationResult {
  // Check minimum resolution (> 640x480)
  // Check file size (> 50 KB — likely not blank)
  // Optional: check blur using canvas-based Laplacian variance
}

export const MAX_PHOTOS_PER_SUBMISSION = 10;
```

> **iOS Safari note:** As of iOS 16.4+, PWAs added to the Home Screen support `getUserMedia`. Older iOS versions fall back to the file input approach, which still opens the native camera and works reliably.

### 7.3 Photo Ordering UI

After selecting/capturing photos, the user sees a thumbnail strip with drag-and-drop reordering:

```
┌─────────────────────────────────────────────────┐
│  Homework Photos (3 of 10 max)                  │
│                                                 │
│  ┌─────┐  ┌─────┐  ┌─────┐   ┌─────────────┐  │
│  │  1  │  │  2  │  │  3  │   │  + Add more  │  │
│  │ 📷  │  │ 📷  │  │ 📷  │   │             │  │
│  │  ✕  │  │  ✕  │  │  ✕  │   └─────────────┘  │
│  └─────┘  └─────┘  └─────┘                     │
│   ↔ drag to reorder                            │
│                                                 │
│  ┌──────────────────────────────────────────┐   │
│  │          Submit for AI Review            │   │
│  │          (costs 1 AI token)              │   │
│  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

Each thumbnail has:
- A sequential number badge (updates on reorder)
- An "x" button to remove the photo
- Drag handle for reordering (using `@dnd-kit/sortable` or similar)

### 7.4 Service Worker (Workbox)

```javascript
// Cache strategies
// - App shell (HTML, CSS, JS):   CacheFirst (precache on install)
// - API calls:                    NetworkFirst with 10s timeout
// - Homework photos (uploaded):   CacheFirst with 7-day expiration
// - AI results:                   NetworkOnly (always fresh)
// - Fonts / static assets:        CacheFirst with 30-day expiration
```

### 7.5 Offline Submission Queue

When the device is offline, submissions are queued in IndexedDB and retried on reconnect:

```typescript
// Uses Workbox BackgroundSync for reliable retry
import { BackgroundSyncPlugin } from 'workbox-background-sync';

const bgSyncPlugin = new BackgroundSyncPlugin('submissionQueue', {
  maxRetentionTime: 24 * 60, // retry for up to 24 hours
});

// Register the route for POST /api/submissions
registerRoute(
  '/api/submissions',
  new NetworkOnly({ plugins: [bgSyncPlugin] }),
  'POST'
);
```

---

## 8. Dashboard Home Page Design

After login, the parent lands on the dashboard. It has two main areas: **subject blocks** (top) and a **camera button** (bottom, always visible).

### 8.1 Dashboard Layout

```
┌─────────────────────────────────────────────────┐
│  HomeworkAI          [child ▼]  [tokens: 12] ⚙  │  ← Header: child selector, balance
│─────────────────────────────────────────────────│
│                                                 │
│  ┌──────────────────┐  ┌──────────────────┐     │
│  │   📐 Math         │  │   📖 English      │     │
│  │   3 wrong answers │  │   5 wrong answers │     │
│  └──────────────────┘  └──────────────────┘     │
│                                                 │
│  ┌──────────────────┐  ┌──────────────────┐     │
│  │   🔬 Science      │  │   🈶 Chinese      │     │
│  │   1 wrong answer  │  │   2 wrong answers │     │
│  └──────────────────┘  └──────────────────┘     │
│                                                 │
│  ┌──────────────────┐                           │
│  │  🈸 Higher Chinese │                           │
│  │   0 wrong answers │                           │
│  └──────────────────┘                           │
│                                                 │
│─────────────────────────────────────────────────│
│                                                 │
│          ┌──────────────────────┐               │
│          │    📷 Scan Homework   │               │  ← Fixed bottom camera button
│          └──────────────────────┘               │
│                                                 │
└─────────────────────────────────────────────────┘
```

### 8.2 Subject Block Behavior

Each subject block is a tappable card that shows:
- Subject name and icon
- Count of **active** (unresolved) wrong/partial answers for the selected child

Tapping a block navigates to that subject's **detail page** (see Section 8.6).

### 8.3 Subject Definitions (Singapore Primary Curriculum)

| Subject ID       | Display Name    | Icon | Description                                   |
| ---------------- | --------------- | ---- | --------------------------------------------- |
| `math`           | Math            | 📐   | Mathematics (P1–P6 MOE syllabus)              |
| `english`        | English         | 📖   | English Language                               |
| `science`        | Science         | 🔬   | Science (starts from P3 per MOE syllabus)     |
| `chinese`        | Chinese         | 🈶   | Chinese Language (Mother Tongue)              |
| `higher_chinese` | Higher Chinese  | 🈸   | Higher Chinese Language                        |

### 8.4 Camera Button

The camera button is **fixed at the bottom** of the screen and visible on all dashboard views. Tapping it opens the multi-photo capture flow (Section 7.2–7.3). The parent does **not** need to select a subject — the AI auto-detects it from the photo content.

### 8.5 Dashboard API

The dashboard data is loaded with a single call. Counts reflect only **active (unresolved)** answers — resolved answers are excluded.

`GET /api/wrong-answers/summary?childId=<uuid>`

```json
{
  "childId": "uuid",
  "childName": "Wei Ming",
  "grade": 3,
  "subjects": [
    { "subject": "math",           "activeWrongCount": 3, "activePartialCount": 1, "resolvedCount": 7 },
    { "subject": "english",        "activeWrongCount": 5, "activePartialCount": 2, "resolvedCount": 3 },
    { "subject": "science",        "activeWrongCount": 1, "activePartialCount": 0, "resolvedCount": 0 },
    { "subject": "chinese",        "activeWrongCount": 2, "activePartialCount": 1, "resolvedCount": 2 },
    { "subject": "higher_chinese", "activeWrongCount": 0, "activePartialCount": 0, "resolvedCount": 0 }
  ]
}
```

### 8.6 Subject Detail Page (Active / Resolved)

When the parent taps a subject block, they see the detail page with two tabs. Both tabs have **"Generate Practice"** and **"Weakness Report"** buttons, and each question has a **delete** button.

```
┌─────────────────────────────────────────────────┐
│  ← Back    📐 Math                              │
│─────────────────────────────────────────────────│
│  ┌───────────────┐  ┌───────────────┐           │
│  │ Active (4)    │  │ Resolved (7)  │           │  ← Tab switcher
│  └───────┬───────┘  └───────────────┘           │
│          │                                      │
│  ┌────────────────────┐ ┌──────────────────┐    │
│  │ Generate Practice  │ │ Weakness Report  │    │  ← Two action buttons
│  │ (4×2=8 Qs) [×2 ▼] │ │ (1 AI token)     │    │
│  │ 1 AI token         │ │                  │    │
│  └────────────────────┘ └──────────────────┘    │
│                                                 │
│  1. 45 + 27 = ?              ✗ wrong            │
│     Student: 63  Correct: 72                    │
│     Topic: Addition                             │
│     [Resolve ✓]  [🗑 Delete]                    │  ← Resolve + hard-delete
│─────────────────────────────────────────────────│
│  2. 156 + 78 = ?             △ partial          │
│     Student: 224  Correct: 234                  │
│     Topic: Addition                             │
│     [Resolve ✓]  [🗑 Delete]                    │
│─────────────────────────────────────────────────│
│  3. 3/4 + 1/2 = ?            ✗ wrong            │
│     Student: 4/6  Correct: 5/4                  │
│     Topic: Fractions                            │
│     [Resolve ✓]  [🗑 Delete]                    │
│─────────────────────────────────────────────────│
│         ... more questions ...                  │
│                                                 │
│          ┌──────────────────────┐               │
│          │    📷 Scan Homework   │               │
│          └──────────────────────┘               │
└─────────────────────────────────────────────────┘
```

**Active tab:**
- Shows all unresolved wrong/partial answers for this subject
- **"Generate Practice"** — generates practice for **all** active questions, default ×2, configurable via dropdown. Costs 1 token.
- **"Weakness Report"** — sends **all** wrong/partial answers (active + resolved) to AI for analysis. Returns grouped topics, ranked weaknesses, and suggestions. Costs 1 token.
- Each question has a "Resolve" button (moves to Resolved tab) and a "Delete" button (hard delete from DB)
- Delete shows a confirmation dialog: "This will permanently remove this question. This cannot be undone."

**Resolved tab (same layout):**
- Shows all resolved questions for this subject
- **Same "Generate Practice" button** — generates practice for **all** resolved questions in this subject
- **Same "Weakness Report" button** — same report (always includes all active + resolved)
- Each question has an "Unresolve" button (moves back to Active) and a "Delete" button (hard delete)

### 8.7 Practice Generation UX

| Step | Action | Detail |
| ---- | ------ | ------ |
| 1    | Open subject | Parent taps a subject block on the dashboard |
| 2    | Click generate | "Generate Practice" button at the top — uses **all** questions in the current tab (active or resolved) |
| 3    | Adjust multiplier (optional) | Dropdown defaults to ×2; parent can change to 1, 2, 3, 5, or 10 |
| 4    | Confirm | Button shows total count (questions × multiplier) and token cost (always 1) |
| 5    | Loading | Progress indicator while AI generates questions |
| 6    | View results | Practice questions displayed in a scrollable list |
| 7    | Print | "Print A4" button opens print preview with answer key on separate page |

### 8.8 Delete Behavior

Deleting a wrong answer is a **hard delete** — the row is permanently removed from the `wrong_answers` table and cannot be recovered.

- Frontend shows a confirmation dialog before calling `DELETE /api/wrong-answers/:id`
- If the deleted question was referenced by a `practice_questions.source_wrong_id`, that FK is set to `NULL` (existing practice sessions are not affected)
- Dashboard subject counts update immediately after deletion

### 8.9 Weakness Report Page

After clicking "Weakness Report", the parent sees a report page:

```
┌─────────────────────────────────────────────────┐
│  ← Back    📐 Math — Weakness Report            │
│─────────────────────────────────────────────────│
│                                                 │
│  📊 Summary                                     │
│  Wei Ming struggles most with Fractions          │
│  (5 errors) and Word Problems (3 errors).        │
│  Addition and subtraction are improving.         │
│                                                 │
│─────────────────────────────────────────────────│
│  Weaknesses (ranked by severity)                │
│                                                 │
│  🔴 #1  Fractions               5 errors        │
│  Pattern: Adds numerators and denominators       │
│  separately instead of finding common            │
│  denominators.                                   │
│  Suggestion: Practice finding LCM before         │
│  adding fractions.                               │
│                                                 │
│  🟡 #2  Word Problems           3 errors        │
│  Pattern: Misidentifies the operation needed     │
│  from the problem context.                       │
│  Suggestion: Practice identifying keywords       │
│  (total, left, each, etc.)                       │
│                                                 │
│  🟢 #3  Addition                1 error         │
│  Pattern: Carry-over error in tens column.       │
│  Suggestion: Practice multi-digit addition       │
│  with regrouping.                                │
│                                                 │
│─────────────────────────────────────────────────│
│  Questions grouped by topic                     │
│                                                 │
│  ▼ Fractions (5 questions)                      │
│    1. 3/4 + 1/2 = ?         ✗ wrong             │
│    2. 2/3 − 1/4 = ?         △ partial           │
│    ...                                          │
│                                                 │
│  ▼ Word Problems (3 questions)                  │
│    1. Ali has 24 marbles...  ✗ wrong             │
│    ...                                          │
│                                                 │
│─────────────────────────────────────────────────│
│                                                 │
│  ┌──────────────────────────────────────────┐   │
│  │  Practice Weaknesses (≈12 Qs)           │   │  ← AI generates more Qs for weaker topics
│  │  costs 1 AI token         [×2 ▼]        │   │
│  └──────────────────────────────────────────┘   │
│                                                 │
│  ┌──────────────────────────────────────────┐   │
│  │  🖨 Print Report                         │   │
│  └──────────────────────────────────────────┘   │
│                                                 │
└─────────────────────────────────────────────────┘
```

**Key behaviors:**
- Weakness severity is color-coded: red (high), yellow (medium), green (low)
- Topic groups are collapsible — tap to expand/collapse the question list
- **"Practice Weaknesses"** button generates targeted practice: AI creates more questions for higher-severity weaknesses (high: multiplier+1 each, medium: multiplier each, low: multiplier−1 each, minimum 1)
- **"Print Report"** prints the weakness analysis in A4 format
- The report includes **all** questions for the subject (both active and resolved), giving a complete picture

---

## 9. Print Design (A4 Worksheet)

### 8.1 CSS Print Stylesheet

```css
@media print {
  @page {
    size: A4 portrait;
    margin: 15mm 20mm;
  }

  body {
    font-family: 'Noto Sans SC', sans-serif;
    font-size: 14pt;
    line-height: 1.6;
    color: #000;
  }

  .worksheet-header {
    text-align: center;
    border-bottom: 2px solid #000;
    padding-bottom: 8mm;
    margin-bottom: 10mm;
  }

  .worksheet-header h1 { font-size: 18pt; }
  .worksheet-header .meta { font-size: 11pt; color: #333; }

  .question {
    margin-bottom: 8mm;
    page-break-inside: avoid;
  }

  .question-number {
    font-weight: bold;
    margin-right: 3mm;
  }

  .answer-space {
    border-bottom: 1px dashed #999;
    height: 12mm;
    margin-top: 3mm;
  }

  .no-print { display: none; }
}
```

### 8.2 Worksheet Layout

```
┌─────────────────────────────────────┐
│          HomeworkAI Practice         │  ← Page 1: Questions
│  Student: ___   Grade: 3   Date: _  │
│  Topic: Addition & Subtraction      │
│─────────────────────────────────────│
│                                     │
│  1. 45 + 27 = _____                │
│     ─────────────────               │
│                                     │
│  2. 83 - 39 = _____                │
│     ─────────────────               │
│                                     │
│  3. 156 + 78 = _____               │
│     ─────────────────               │
│         ...                         │
│                                     │
└─────────────────────────────────────┘
       ↓ page-break-before: always ↓
┌─────────────────────────────────────┐
│           Answer Key                │  ← Separate page
│─────────────────────────────────────│
│  1. 72     Explanation: ...         │
│  2. 44     Explanation: ...         │
│  3. 234    Explanation: ...         │
└─────────────────────────────────────┘
```

### 8.3 Answer Key Separation

```css
.answer-key {
  page-break-before: always;
}

.answer-key .explanation {
  font-size: 11pt;
  color: #555;
  margin-left: 5mm;
}
```

Parents can choose whether to include the answer key page when printing.

---

## 10. Result Display Design (Color-Coded Blocks)

The AI response is rendered as a list of numbered blocks. Each block is a self-contained card showing one question's result. The numbering is continuous across all submitted photos (1, 2, 3, ...) and matches the order returned by the AI.

### 10.1 Block Color Coding

| Status            | Background Color         | Tailwind Class           | Hex        |
| ----------------- | ------------------------ | ------------------------ | ---------- |
| Correct           | Light green              | `bg-green-50`            | `#F0FDF4`  |
| Partially correct | Light yellow             | `bg-yellow-50`           | `#FEFCE8`  |
| Wrong             | Light red                | `bg-red-50`              | `#FEF2F2`  |

### 10.2 Result Block Layout

```
┌─────────────────────────────────────────────────┐
│  ┌───┐                                          │ ← bg-red-50 (wrong)
│  │ 1 │  Question: 45 + 27 = ?                   │
│  └───┘                                          │
│        Student's answer:  63                     │
│        Correct answer:    72                     │
│        ─────────────────────────────────         │
│        Explanation:                              │
│        45 + 27: first add 45 + 20 = 65,         │
│        then 65 + 7 = 72. The student may have   │
│        miscounted when carrying over.            │
│        ─────────────────────────────────         │
│        Topic: Addition  │  Photo: 1 of 3        │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  ┌───┐                                          │ ← bg-green-50 (correct)
│  │ 2 │  Question: 83 - 39 = ?                   │
│  └───┘                                          │
│        Student's answer:  44                     │
│        Correct answer:    44                     │
│        ─────────────────────────────────         │
│        Explanation:                              │
│        Correct! 83 - 39 = 44. Great job!         │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  ┌───┐                                          │ ← bg-yellow-50 (partial)
│  │ 3 │  Question: 156 + 78 = ?                  │
│  └───┘                                          │
│        Student's answer:  224                    │
│        Correct answer:    234                    │
│        ─────────────────────────────────         │
│        Explanation:                              │
│        The method was correct (carried the 1     │
│        from 6+8=14) but made an error adding     │
│        the tens: 5+7+1 = 13, not 12.            │
│        ─────────────────────────────────         │
│        Topic: Addition  │  Photo: 2 of 3        │
└─────────────────────────────────────────────────┘
```

### 10.3 Result Block Component

```tsx
interface ResultBlock {
  number: number;
  imageOrder: number;
  questionText: string;
  studentAnswer: string;
  correctAnswer: string;
  status: 'correct' | 'partial_correct' | 'wrong';
  explanation: string;
  topic: string;
}

function getBlockStyle(status: ResultBlock['status']): string {
  switch (status) {
    case 'correct':         return 'bg-green-50 border-green-200';
    case 'partial_correct': return 'bg-yellow-50 border-yellow-200';
    case 'wrong':           return 'bg-red-50 border-red-200';
  }
}

function ResultBlockCard({ block, totalImages }: { 
  block: ResultBlock; 
  totalImages: number;
}) {
  return (
    <div className={`rounded-lg border p-4 mb-3 ${getBlockStyle(block.status)}`}>
      <div className="flex items-start gap-3">
        <span className="flex-shrink-0 w-8 h-8 rounded-full bg-white 
                         border-2 flex items-center justify-center 
                         font-bold text-sm">
          {block.number}
        </span>
        <div className="flex-1">
          <p className="font-medium">{block.questionText}</p>
          <p className="mt-1">Student's answer: <strong>{block.studentAnswer}</strong></p>
          <p>Correct answer: <strong>{block.correctAnswer}</strong></p>
          <hr className="my-2 border-current opacity-20" />
          <p className="text-sm">{block.explanation}</p>
          <div className="mt-2 text-xs text-gray-500 flex justify-between">
            <span>Topic: {block.topic}</span>
            {totalImages > 1 && (
              <span>Photo: {block.imageOrder} of {totalImages}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

### 10.4 Result Summary Header

Above the blocks, a summary bar shows the aggregate score:

```
┌─────────────────────────────────────────────────┐
│  📐 Math  •  15 questions from 3 photos         │  ← AI-detected subject
│  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │ ✓ 10     │  │ △ 2      │  │ ✗ 3      │      │
│  │ Correct  │  │ Partial  │  │ Wrong    │      │
│  └──────────┘  └──────────┘  └──────────┘      │
│  Token balance: 12 remaining                    │
└─────────────────────────────────────────────────┘
```

### 10.5 API Response Shape

`GET /api/submissions/:id` returns:

```json
{
  "id": "uuid",
  "status": "completed",
  "detectedSubject": "math",
  "imageCount": 3,
  "images": [
    { "sortOrder": 1, "imageUrl": "https://..." },
    { "sortOrder": 2, "imageUrl": "https://..." },
    { "sortOrder": 3, "imageUrl": "https://..." }
  ],
  "result": {
    "summary": "10 correct, 2 partially correct, 3 wrong out of 15 questions.",
    "totalQuestions": 15,
    "correctCount": 10,
    "partialCorrectCount": 2,
    "wrongCount": 3,
    "questions": [
      {
        "number": 1,
        "imageOrder": 1,
        "questionText": "45 + 27 = ?",
        "studentAnswer": "63",
        "correctAnswer": "72",
        "status": "wrong",
        "explanation": "45 + 27: first add 45 + 20 = 65, then 65 + 7 = 72.",
        "topic": "addition",
        "difficulty": "easy"
      },
      {
        "number": 2,
        "imageOrder": 1,
        "questionText": "83 - 39 = ?",
        "studentAnswer": "44",
        "correctAnswer": "44",
        "status": "correct",
        "explanation": "Correct! 83 - 39 = 44. Great job!",
        "topic": "subtraction",
        "difficulty": "easy"
      }
    ]
  },
  "tokenBalance": 12
}
```

> **Storage note:** Only questions with `status: "wrong"` or `status: "partial_correct"` are persisted to the `wrong_answers` table. Questions with `status: "correct"` are returned in the API response for display but are **not** stored in the database.
```

---

## 11. Security Design

| Concern               | Approach                                                                |
| ---------------------- | ----------------------------------------------------------------------- |
| Authentication         | JWT with short-lived access tokens (15 min) + refresh tokens (7 days)  |
| Password Storage       | bcrypt with cost factor 12                                              |
| API Authorization      | Middleware validates JWT; parents can only access their own children    |
| Token Quota Enforcement| Every AI-consuming request checks `token_balances` in a DB transaction before proceeding; returns 403 if balance = 0 |
| Token Transaction Integrity | Token deduction + transaction log in a single Prisma `$transaction`; prevents double-spend via row-level locking |
| Payment Webhook Security | Verify Stripe webhook signature (`stripe-signature` header) before crediting tokens; idempotency key prevents duplicate credits |
| Image Upload           | Max 10 MB per image, max 10 images per submission; validate MIME type server-side (JPEG, PNG, HEIC only); strip EXIF GPS data for privacy |
| AI API Keys            | Stored in environment variables, never exposed to client; rotated quarterly |
| Rate Limiting          | 20 submissions/hour per parent (in addition to token quota)             |
| Children's Data (PDPA) | Comply with Singapore PDPA; collect minimal PII; parent consent required; no child-facing accounts |
| Input Sanitization     | Parameterized SQL (Prisma); sanitize all user inputs                    |
| HTTPS                  | Enforced everywhere; HSTS enabled                                       |
| CORS                   | Whitelist frontend origin only                                          |

---

## 12. Project Structure

```
homework-ai/
├── frontend/                    # PWA (React + Vite)
│   ├── public/
│   │   ├── manifest.json
│   │   ├── sw.js
│   │   └── icons/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── SubjectCard.tsx       # Dashboard subject block (icon, name, wrong count)
│   │   │   ├── CameraFab.tsx        # Fixed bottom camera button
│   │   │   ├── Camera.tsx           # Camera capture component
│   │   │   ├── PhotoPicker.tsx      # Multi-photo select, reorder (drag-and-drop), max 10
│   │   │   ├── ResultBlockCard.tsx  # Single color-coded result block
│   │   │   ├── ResultSummary.tsx    # Aggregate score bar (correct/partial/wrong)
│   │   │   ├── WrongAnswerList.tsx  # Active/Resolved tabs with generate & delete
│   │   │   ├── DeleteConfirmDialog.tsx # Confirmation modal for hard-delete
│   │   │   ├── PracticeSheet.tsx    # Print-ready worksheet
│   │   │   └── PrintButton.tsx      # Trigger window.print()
│   │   ├── pages/
│   │   │   ├── Login.tsx
│   │   │   ├── Register.tsx
│   │   │   ├── Dashboard.tsx        # Home page: 5 subject blocks + camera FAB
│   │   │   ├── TokenBalance.tsx        # Balance display + buy tokens
│   │   │   ├── TokenPurchase.tsx       # Package selection + payment
│   │   │   ├── CameraCapture.tsx
│   │   │   ├── SubmissionResult.tsx
│   │   │   ├── SubjectDetail.tsx       # Active/Resolved tabs, generate practice, weakness report
│   │   │   ├── WeaknessReport.tsx     # Weakness report view (summary, ranked topics, grouped Qs)
│   │   │   └── PracticeResult.tsx      # View + print generated practice questions
│   │   ├── services/
│   │   │   ├── api.ts               # Axios/fetch wrapper
│   │   │   ├── auth.ts              # Token management
│   │   │   └── camera.ts            # Camera utilities
│   │   ├── hooks/
│   │   ├── stores/                  # Zustand state management
│   │   └── styles/
│   │       └── print.css            # A4 print stylesheet
│   ├── Dockerfile               # Multi-stage: build with Node → serve with Nginx
│   ├── nginx.conf               # Nginx config for SPA routing + caching
│   ├── vite.config.ts
│   └── package.json
│
├── backend/                     # API Server (Node.js + Fastify)
│   ├── src/
│   │   ├── index.ts                 # Server entry point
│   │   ├── config/
│   │   │   └── env.ts               # Environment config
│   │   ├── routes/
│   │   │   ├── auth.ts
│   │   │   ├── tokens.ts              # Balance, packages, purchase, webhook
│   │   │   ├── children.ts
│   │   │   ├── submissions.ts
│   │   │   ├── wrong-answers.ts
│   │   │   ├── practice.ts
│   │   │   └── reports.ts              # Weakness reports + weakness practice
│   │   ├── services/
│   │   │   ├── auth.service.ts
│   │   │   ├── token.service.ts       # Balance check, deduct, credit, refund
│   │   │   ├── homework.service.ts
│   │   │   ├── practice.service.ts
│   │   │   └── ai/
│   │   │       ├── ai-gateway.ts    # Provider abstraction
│   │   │       ├── openai.provider.ts
│   │   │       ├── gemini.provider.ts
│   │   │       └── prompts.ts       # Prompt templates
│   │   ├── middleware/
│   │   │   ├── auth.middleware.ts
│   │   │   ├── token-quota.middleware.ts  # Check & deduct tokens before AI calls
│   │   │   └── rate-limit.ts
│   │   └── utils/
│   │       └── image.ts             # Image preprocessing
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   ├── Dockerfile               # Multi-stage: build with Node → run with Node slim
│   ├── tsconfig.json
│   └── package.json
│
├── docker-compose.yml           # Local dev (Postgres, MinIO, etc.)
├── docker-compose.prod.yml      # Production overrides for Coolify
├── .github/workflows/           # CI (tests, lint); deploy via Coolify webhook
└── README.md
```

---

## 13. Deployment Architecture (Coolify)

All services are deployed on a single VPS (or multiple servers) managed by **Coolify**, an open-source self-hosted PaaS. Coolify handles Docker builds, SSL certificates (via Let's Encrypt), reverse proxy (Traefik), zero-downtime deployments, and environment variable management.

```
                     ┌──────────────┐
                     │  Cloudflare   │
                     │  CDN + DNS    │
                     └──────┬───────┘
                            │
               ┌────────────┴────────────────────────┐
               │         VPS (e.g. Hetzner)          │
               │         managed by Coolify           │
               │                                     │
               │  ┌───────────────────────────────┐  │
               │  │  Traefik (reverse proxy + SSL) │  │
               │  └──────────┬────────────────────┘  │
               │             │                        │
               │    ┌────────┴─────────┐              │
               │    │                  │              │
               │  ┌─┴──────────┐ ┌────┴──────────┐  │
               │  │  Frontend   │ │  Backend       │  │
               │  │  (Docker)   │ │  (Docker)      │  │
               │  │  PWA SPA    │ │  Node.js API   │  │
               │  │  Nginx      │ │  Fastify       │  │
               │  └────────────┘ └────┬───────────┘  │
               │                      │               │
               │         ┌────────────┴──────┐        │
               │         │                   │        │
               │  ┌──────┴──────┐  ┌─────────┴─────┐ │
               │  │ PostgreSQL   │  │  MinIO / S3   │ │
               │  │ (Docker)     │  │  (Docker)     │ │
               │  │ + volumes    │  │  Image store  │ │
               │  └─────────────┘  └───────────────┘ │
               │                                     │
               └─────────────────────────────────────┘
```

### 12.1 Coolify Service Configuration

| Service        | Type             | Docker Image / Build          | Notes                                    |
| -------------- | ---------------- | ----------------------------- | ---------------------------------------- |
| **Frontend**   | Application      | Build from `frontend/Dockerfile` (Vite → Nginx) | Static PWA served by Nginx; Coolify handles SSL via Traefik |
| **Backend**    | Application      | Build from `backend/Dockerfile` (Node.js) | Fastify API server; Coolify manages health checks and restarts |
| **PostgreSQL** | Database         | `postgres:16-alpine`          | Managed by Coolify with automatic volume mounts and backups |
| **MinIO**      | Service (Docker) | `minio/minio`                 | S3-compatible object storage for homework images; optional — can use external S3/R2 instead |

### 12.2 Deployment Flow

```
Developer pushes to GitHub
  → GitHub webhook notifies Coolify
  → Coolify pulls latest code
  → Builds Docker image(s) for changed services
  → Runs database migrations (prisma migrate deploy)
  → Zero-downtime deploy via rolling container replacement
  → Traefik routes traffic to new containers
  → Old containers gracefully shut down
```

### 12.3 Coolify Features Used

| Feature                | Usage                                                   |
| ---------------------- | ------------------------------------------------------- |
| GitHub integration     | Auto-deploy on push to `main` branch                   |
| Environment variables  | Manage secrets per service (DB creds, API keys, JWT)    |
| SSL / Let's Encrypt    | Automatic HTTPS for `homeworkai.app` and `api.homeworkai.app` |
| Traefik reverse proxy  | Route `homeworkai.app` → frontend, `api.homeworkai.app` → backend |
| Database backups       | Scheduled PostgreSQL backups to local volume or S3      |
| Health checks          | Auto-restart unhealthy containers                       |
| Log aggregation        | View logs per service in Coolify dashboard              |
| Resource monitoring    | CPU, memory, disk per container                         |

---

## 14. Environment Variables

All environment variables are managed in Coolify's per-service settings UI. They are injected at container startup and never committed to the repo.

```bash
# Backend (set in Coolify → backend service → Environment)
DATABASE_URL=postgresql://user:pass@homework-ai-db:5432/homework_ai  # Coolify internal hostname
JWT_SECRET=<random-256-bit>
JWT_REFRESH_SECRET=<random-256-bit>

# AI Providers
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=AI...
AI_DEFAULT_PROVIDER=openai          # openai | gemini

# Object Storage (MinIO on Coolify, or external S3/R2)
S3_ENDPOINT=http://homework-ai-minio:9000   # Coolify internal hostname; omit for AWS S3
S3_BUCKET=homework-ai-images
S3_REGION=us-east-1
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_FORCE_PATH_STYLE=true                    # required for MinIO; false for AWS S3

# Payments (Stripe)
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Rate Limiting
RATE_LIMIT_SUBMISSIONS_PER_HOUR=20
RATE_LIMIT_API_CALLS_PER_DAY=100

# Monitoring
SENTRY_DSN=https://...@sentry.io/...

# Frontend (set in Coolify → frontend service → Build Variables)
VITE_API_BASE_URL=https://api.homeworkai.app
VITE_SENTRY_DSN=https://...@sentry.io/...
```

---

## 15. Logging & Monitoring

| Layer      | Tool           | What to Track                                                |
| ---------- | -------------- | ------------------------------------------------------------ |
| Errors     | Sentry         | Unhandled exceptions, AI parse failures, upload errors        |
| API Metrics| Grafana + Prometheus | Request latency p50/p95/p99, error rates, throughput   |
| AI Costs   | Custom dashboard | Cost per scan, daily/monthly spend, per-provider breakdown  |
| Business   | PostHog / Mixpanel | Registration funnel, scan frequency, print usage, retention |
| Uptime     | UptimeRobot    | Health check endpoint `/api/health` every 60s                |

### Health Check Endpoint

```typescript
// GET /api/health
{
  "status": "ok",
  "version": "1.0.0",
  "db": "connected",
  "ai_providers": {
    "openai": "reachable",
    "gemini": "reachable"
  },
  "uptime_seconds": 86400
}
```

---

## 16. Error Handling Strategy

| Error Type              | HTTP | Handling                                                    |
| ----------------------- | ---- | ----------------------------------------------------------- |
| Insufficient tokens     | 403  | Return `INSUFFICIENT_TOKENS` error with current balance (0) and link to purchase packages; frontend shows buy-tokens modal |
| AI response parse error | 500  | Retry once with stricter prompt; if still fails, **refund the deducted token** and return user-friendly error; log to Sentry |
| AI provider timeout     | 504  | Retry with exponential backoff (max 2 retries); fallback to secondary provider; refund token if all retries fail |
| AI provider outage      | 503  | Automatic failover to secondary provider; refund token and queue if all providers down |
| Image upload failure    | —    | Client-side retry with IndexedDB queue; resume on reconnect (no token deducted yet) |
| Invalid image format    | 400  | Reject client-side with guidance (accepted: JPEG, PNG, HEIC); no token deducted |
| Too many images         | 400  | Reject if more than 10 images submitted; no token deducted |
| Payment webhook failure | —    | Log failed webhook; do not credit tokens; Stripe will retry automatically |
| Duplicate payment event | —    | Idempotency check via `payment_id` in `token_transactions`; skip if already processed |
| Rate limit exceeded     | 429  | Return `Retry-After` header; show friendly message in UI |
| JWT expired             | 401  | Auto-refresh via refresh token; redirect to login if refresh also expired |

---

## 17. Non-Functional Requirements

| Requirement     | Target                                           |
| --------------- | ------------------------------------------------ |
| Response Time   | API < 500 ms (excluding AI call); AI < 15 s       |
| Availability    | 99.5 % uptime                                     |
| Scalability     | Support 10K concurrent users in Phase 2           |
| Image Size      | Accept up to 10 MB per image, max 10 images per submission; compress each to < 2 MB before AI |
| Browser Support | iOS Safari 16.4+ (PWA camera), Chrome 90+, Samsung Internet 20+ |
| PWA Score       | Lighthouse PWA score > 90                         |
| Accessibility   | WCAG 2.1 AA for core flows                        |
| Data Retention  | Homework images auto-deleted after 30 days; wrong answers retained indefinitely |
| Backup          | Daily automated PostgreSQL backups with 30-day retention |

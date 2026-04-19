# M3–M9: AI Core, Records, Practice, Reports, PWA, Deployment Design

## Goal

Complete HomeworkAI from AI integration through production deployment, covering:
- M3: OpenAI vision analysis with configurable AI settings
- M4: Wrong-answer records CRUD with subject detail pages
- M5: AI-generated practice questions with A4 print layout
- M6: AI weakness reports per subject
- M7: PWA manifest, service worker, offline shell
- M8/M9: Local Docker setup + production deployment config

---

## Section 1: AI Configuration Architecture

AI model settings are stored in `SystemConfig` and read at runtime (cached 5 minutes in memory). This allows changing the model or tuning parameters without code deploys.

### SystemConfig keys added in seed

| Key | Default | Purpose |
|-----|---------|---------|
| `ai_model` | `"gpt-4o-mini"` | OpenAI model name |
| `ai_max_tokens` | `4096` | Max completion tokens per call |
| `ai_temperature` | `0.1` | Sampling temperature |
| `ai_provider` | `"openai"` | Provider identifier (future: gemini) |

OpenAI API key stays in `OPENAI_API_KEY` env var (never in DB).

### `packages/api/src/lib/ai-config.ts`

Reads AI settings from SystemConfig, caches for 5 minutes:

```typescript
interface AiConfig {
  model: string;
  maxTokens: number;
  temperature: number;
  provider: string;
}

let _cache: AiConfig | null = null;
let _cacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function getAiConfig(prisma: PrismaClient): Promise<AiConfig> {
  if (_cache && Date.now() - _cacheTime < CACHE_TTL_MS) return _cache;
  const rows = await prisma.systemConfig.findMany({
    where: { key: { in: ['ai_model', 'ai_max_tokens', 'ai_temperature', 'ai_provider'] } },
  });
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  _cache = {
    model: (map['ai_model'] as string) ?? 'gpt-4o-mini',
    maxTokens: (map['ai_max_tokens'] as number) ?? 4096,
    temperature: (map['ai_temperature'] as number) ?? 0.1,
    provider: (map['ai_provider'] as string) ?? 'openai',
  };
  _cacheTime = Date.now();
  return _cache;
}
```

---

## Section 2: Docker Setup

### `docker-compose.dev.yml` — hot-reload development

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
      - mysql_dev_data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-u", "app", "-papp"]
      interval: 5s
      timeout: 5s
      retries: 10

  api:
    build:
      context: .
      dockerfile: packages/api/Dockerfile.dev
    ports: ["3000:3000"]
    volumes:
      - ./packages/api/src:/app/packages/api/src
      - ./packages/api/uploads:/app/packages/api/uploads
    env_file: .env.local
    depends_on:
      mysql:
        condition: service_healthy

  web:
    build:
      context: .
      dockerfile: packages/web/Dockerfile.dev
    ports: ["5173:5173"]
    volumes:
      - ./packages/web/src:/app/packages/web/src
    env_file: .env.local
    depends_on:
      - api

volumes:
  mysql_dev_data:
```

### `docker-compose.prod.yml` — production-like built images

```yaml
services:
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
      MYSQL_DATABASE: homework_ai
      MYSQL_USER: ${MYSQL_USER}
      MYSQL_PASSWORD: ${MYSQL_PASSWORD}
    volumes:
      - mysql_prod_data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-u", "${MYSQL_USER}", "-p${MYSQL_PASSWORD}"]
      interval: 5s
      timeout: 5s
      retries: 10

  api:
    build:
      context: .
      dockerfile: packages/api/Dockerfile
    env_file: .env.prod
    depends_on:
      mysql:
        condition: service_healthy

  nginx:
    image: nginx:alpine
    ports: ["80:80"]
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - web_dist:/usr/share/nginx/html
    depends_on:
      - api

  web-builder:
    build:
      context: .
      dockerfile: packages/web/Dockerfile
    volumes:
      - web_dist:/app/dist

volumes:
  mysql_prod_data:
  web_dist:
```

### Dockerfiles

**`packages/api/Dockerfile`** (multi-stage):
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY packages/api/package*.json ./packages/api/
COPY packages/shared/package*.json ./packages/shared/
RUN npm ci
COPY packages/shared ./packages/shared
COPY packages/api ./packages/api
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=packages/api

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/packages/api/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY packages/api/package*.json ./
RUN mkdir -p uploads/avatars uploads/submissions
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

**`packages/web/Dockerfile`** (build stage for nginx):
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY packages/web/package*.json ./packages/web/
COPY packages/shared/package*.json ./packages/shared/
RUN npm ci
COPY packages/shared ./packages/shared
COPY packages/web ./packages/web
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=packages/web
```

**`nginx.conf`** (reverse proxy):
```nginx
events {}
http {
  include /etc/nginx/mime.types;
  server {
    listen 80;
    location /api/ { proxy_pass http://api:3000; }
    location /uploads/ { proxy_pass http://api:3000; }
    location / {
      root /usr/share/nginx/html;
      try_files $uri $uri/ /index.html;
    }
  }
}
```

**`.env.local.example`** (for dev):
```
DATABASE_URL=mysql://app:app@mysql:3306/homework_ai
JWT_SECRET=dev-secret-change-me
OPENAI_API_KEY=sk-...
```

### Local test flow
1. `docker-compose -f docker-compose.dev.yml up` → hot-reload dev at `localhost:5173`
2. `docker-compose -f docker-compose.prod.yml up --build` → production build at `localhost:80`

---

## Section 3: Parallelization Plan

```
M2 ✅ DONE
 └─► WAVE 1 (parallel): M3-backend + M3-frontend + M7-PWA
         └─► WAVE 2: M4 (sequential — needs M3 wrong answers)
                 └─► WAVE 3 (parallel): M5-backend+frontend + M6-backend+frontend
                         └─► WAVE 4: M8/M9 Docker + CI
```

---

## Section 4: M3 — AI Core

### Files
- Create: `packages/api/src/lib/ai-config.ts`
- Create: `packages/api/src/lib/ai-analysis.ts`
- Create: `packages/api/src/lib/token-helpers.ts`
- Create: `packages/api/src/lib/openai.ts`
- Modify: `packages/api/src/routes/submissions.ts` — add AI analysis to POST
- Modify: `packages/api/prisma/seed.ts` — add ai_model, ai_max_tokens, ai_temperature, ai_provider
- Modify: `packages/web/src/pages/SubmissionResultPage.tsx` — polling + result display (already created in M2, refine)

### API: POST /api/submissions flow
1. Parse multipart: `childId` + `images[]` (1–10)
2. Validate child ownership
3. Check token balance ≥ 1 (return 402 if not)
4. Resize and save images to `uploads/submissions/`
5. Create `Submission` record with status `processing`
6. Deduct 1 token (DB transaction: update balance + insert TokenTransaction)
7. Read AI config from SystemConfig (cached)
8. Call OpenAI with all images as base64 + grade context
9. Parse JSON response → save `AiResponse` + `WrongAnswer` records
10. Update submission status to `completed` + set `detectedSubject`
11. On AI failure: mark `failed`, refund token
12. Return full submission with aiResponse + wrongAnswers

### AI Prompt
System: Expert Singapore primary school homework checker. Detect subject, grade all questions, return JSON only.

Response schema:
```json
{
  "subject": "math",
  "summary": "...",
  "totalQuestions": 5,
  "correctCount": 3,
  "partialCorrectCount": 1,
  "wrongCount": 1,
  "questions": [{
    "questionNumber": 1,
    "imageOrder": 1,
    "questionText": "...",
    "childAnswer": "...",
    "correctAnswer": "...",
    "status": "wrong|partial_correct|correct",
    "explanation": "...",
    "topic": "addition",
    "difficulty": "easy|medium|hard"
  }]
}
```

### token-helpers.ts
- `deductToken(prisma, parentId, referenceId, referenceType)` — Prisma transaction: check balance ≥ 1, decrement, insert TokenTransaction
- `refundToken(prisma, parentId, referenceId, referenceType)` — increment balance, insert TokenTransaction with type `refund`

### Web: SubmissionResultPage
- Polls `GET /api/submissions/:id` every 3s while status is `pending` or `processing`
- Shows spinner during polling
- On `completed`: summary card (✓ correct / ~ partial / ✗ wrong counts) + wrong answer cards with question, child answer, correct answer, explanation, topic badge
- On `failed`: error message with retry option (navigate back to scan)
- Color coding: correct = green, partial = yellow, wrong = red

---

## Section 5: M4 — Records

### Files
- Create: `packages/api/src/routes/wrong-answers.ts`
- Modify: `packages/api/src/app.ts` — register wrongAnswerRoutes
- Create: `packages/web/src/pages/SubjectDetailPage.tsx`
- Modify: `packages/web/src/pages/ChildDashboardPage.tsx` — subject blocks show error count badge, navigate to subject detail
- Modify: `packages/web/src/App.tsx` — add `/subjects/:childId/:subject` route

### Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/wrong-answers?childId=&subject=&resolved=false&page=&limit=` | List wrong answers |
| GET | `/api/wrong-answers/summary?childId=` | Count per subject (unresolved) |
| PATCH | `/api/wrong-answers/:id/resolve` | Set resolvedAt = now() |
| PATCH | `/api/wrong-answers/:id/unresolve` | Clear resolvedAt |
| DELETE | `/api/wrong-answers/:id` | Hard delete |

### Web: SubjectDetailPage (`/subjects/:childId/:subject`)
- Tabs: Active (unresolved) | Resolved
- Each wrong answer card: question text, child answer, correct answer, explanation, topic badge
- Actions: Resolve button (active tab), Unresolve button (resolved tab), Delete button (both)
- Optimistic updates — remove from list immediately on action

### Web: ChildDashboardPage update
- On mount: `GET /api/wrong-answers/summary?childId=` → show red badge with count on each subject block
- Subject blocks navigate to `/subjects/:childId/:subject`

---

## Section 6: M5 — Practice

### Files
- Create: `packages/api/src/routes/practice.ts`
- Create: `packages/api/src/lib/practice-generator.ts`
- Modify: `packages/api/src/app.ts`
- Create: `packages/web/src/pages/PracticePage.tsx`
- Create: `packages/web/src/pages/PrintPage.tsx`
- Modify: `packages/web/src/App.tsx` — add practice routes

### Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/practice/generate` | Generate practice session (deducts 1 token) |
| GET | `/api/practice/sessions?childId=&subject=&page=&limit=` | List sessions |
| GET | `/api/practice/sessions/:id` | Get session with questions |

### POST /api/practice/generate body
```json
{ "childId": "uuid", "subject": "math", "source": "active", "multiplier": 2 }
```

### AI Prompt for practice generation
System: Singapore primary school practice question generator. Given a list of wrong answers, generate `count × multiplier` similar practice questions. Return JSON only.

Response schema:
```json
{
  "questions": [{
    "sourceWrongAnswerId": "uuid or null",
    "question": "...",
    "answer": "...",
    "explanation": "...",
    "topic": "...",
    "difficulty": "easy|medium|hard"
  }]
}
```

### Web: PracticePage (`/practice/:sessionId`)
- Lists all questions numbered, with answers hidden by default
- "Show Answer" toggle per question
- "Print" button opens PrintPage

### Web: PrintPage (`/practice/:sessionId/print`)
- A4 layout with `@media print` CSS
- Questions section + separate answers section at the end
- "Print" button triggers `window.print()`

---

## Section 7: M6 — Reports

### Schema addition
New `WeaknessReport` model (requires migration):
```prisma
model WeaknessReport {
  id             String   @id @default(uuid())
  childId        String
  subject        Subject
  sourceWrongIds Json     // array of wrong answer IDs analyzed
  topicGroups    Json     // grouped by topic with counts
  weaknesses     Json     // ranked weakness analysis
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

### Files
- Modify: `packages/api/prisma/schema.prisma` — add WeaknessReport model
- Create migration
- Create: `packages/api/src/routes/reports.ts`
- Create: `packages/api/src/lib/weakness-analyzer.ts`
- Modify: `packages/api/src/app.ts`
- Create: `packages/web/src/pages/WeaknessReportPage.tsx`
- Modify: `packages/web/src/App.tsx`

### Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/reports/weakness` | Generate report (deducts 1 token) |
| GET | `/api/reports/weakness?childId=&subject=` | Get latest report |

### AI Prompt for weakness analysis
Groups wrong answers by topic, ranks weaknesses, identifies patterns. Returns:
```json
{
  "summary": "...",
  "topicGroups": [{ "topic": "Fractions", "wrongCount": 3, "partialCount": 2 }],
  "weaknesses": [{ "rank": 1, "topic": "Fractions", "severity": "high", "pattern": "...", "suggestion": "..." }]
}
```

### Web: WeaknessReportPage (`/reports/:childId/:subject`)
- Summary paragraph
- Topic breakdown (bar-style progress indicators)
- Ranked weakness list with severity badges
- "Generate Practice" button → calls `POST /api/practice/generate` → navigates to PracticePage

---

## Section 8: M7 — PWA Polish

### Files
- Install: `vite-plugin-pwa` in `packages/web`
- Modify: `packages/web/vite.config.ts` — add VitePWA plugin
- Create: `packages/web/public/manifest.json`
- Create: icon files at 192×192 and 512×512 (SVG-based, generated)
- Modify: `packages/web/index.html` — iOS meta tags, theme-color
- Create: `packages/web/src/components/InstallPrompt.tsx`

### PWA Config
- `display: "standalone"` — full-screen app on home screen
- `theme_color: "#4f46e5"` (indigo-600)
- `background_color: "#ffffff"`
- Offline strategy: cache-first for app shell (JS/CSS/HTML), network-first for API calls
- Workbox `registerRoute` for `/api/*` → NetworkFirst with 5s timeout fallback

### InstallPrompt
- Listens for `beforeinstallprompt` event
- Shows a dismissible banner "Add HomeworkAI to your home screen"
- Stores dismissed state in localStorage

---

## Section 9: M8/M9 — Docker + CI

### Files
- Create: `packages/api/Dockerfile`
- Create: `packages/api/Dockerfile.dev`
- Create: `packages/web/Dockerfile`
- Create: `packages/web/Dockerfile.dev`
- Create: `docker-compose.dev.yml`
- Create: `docker-compose.prod.yml`
- Create: `nginx.conf`
- Create: `.env.local.example`
- Create: `.env.prod.example`
- Modify: `.github/workflows/ci.yml` — add Docker build check

### Dev Dockerfiles
API dev: `ts-node-dev` watching `src/`
Web dev: `vite --host 0.0.0.0`

### Prod Dockerfiles
Multi-stage builds as described in Section 2.

---

## Out of Scope

- Stripe payment integration (already stubbed as 501)
- Email verification / password reset
- Admin dashboard for SystemConfig management
- Push notifications
- Social login

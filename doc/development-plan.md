# HomeworkAI — Development Plan

## 1. Project Overview

**HomeworkAI** is a Progressive Web App (PWA) that helps parents of **Singapore primary school students (Primary 1–6)** check their children's homework using AI. Parents photograph homework with their phone camera, and the app leverages AI vision models (OpenAI GPT-4o / Google Gemini) to evaluate answers based on the child's grade level, explain reasoning, track mistakes, and generate targeted practice questions printable in A4 format.

The AI **automatically categorizes** each photo into the correct subject (Math, English, Science, Chinese, Higher Chinese) — parents do not need to select the subject manually.

The app is built as a **PWA** so that a single codebase works on both **iPhone (via Safari Add-to-Home-Screen)** and **Android (via Chrome install prompt)**, with full camera access on both platforms.

### Key Goals

- Single PWA codebase serving both iPhone and Android — no App Store submission required
- Camera-based homework capture with image quality validation
- AI-powered answer checking with grade-appropriate, age-appropriate feedback
- Token-based access control — every AI request checks the user's token balance in the database; new users get 3 free tokens; additional tokens must be purchased
- Wrong-answer tracking and spaced-repetition-aware practice question generation
- Printable A4 worksheets with answer key on a separate page

---

## 2. Target Users

| Role   | Description                                                        |
| ------ | ------------------------------------------------------------------ |
| Parent | Parent of a Singapore primary school student (P1–P6). Registers account, adds children, photographs homework, reviews AI feedback, generates practice sheets. |
| Child  | (Indirect user) Singapore primary school student. Completes printed practice worksheets. |

---

## 3. Core Features & User Stories

### Phase 1 — MVP (All 5 Subjects)

| # | Feature                  | User Story                                                                                          |
|---|--------------------------|-----------------------------------------------------------------------------------------------------|
| 1 | Parent Registration      | As a parent, I can sign up with email/phone and create an account. I receive 3 free AI tokens upon registration. |
| 2 | Child Profile & Grade    | As a parent, I can add one or more children and set their primary school level (P1–P6).             |
| 3 | Token Balance & Purchase | As a parent, I can see my remaining AI token balance. When tokens run out, I see a clear message to purchase more. I can buy token packs to top up my balance. |
| 4 | Dashboard Home Page      | After login, I see a home page with 5 subject blocks (Math, English, Science, Chinese, Higher Chinese). Tapping a subject opens the subject detail page with active/resolved lists. A camera button at the bottom of the screen lets me quickly take/select photos. |
| 5 | Multi-Photo Capture      | As a parent, I can take or select multiple photos (up to 10) of my child's homework from the bottom camera button, reorder them, and submit. The AI **automatically detects** which subject the homework belongs to — I do not need to choose. |
| 6 | AI Answer Checking       | As a parent, I receive AI-generated feedback as numbered result blocks (continuous numbering across all photos). Each block shows the question, student's answer, correct answer, and explanation. Blocks are color-coded: light green = correct, light yellow = partially correct, light red = wrong. Each submission consumes 1 AI token. |
| 7 | Wrong Answer Record      | The system saves only **wrong** and **partially correct** answers to the database, with the question, student's answer, correct answer, explanation, topic, and AI-detected subject. Correct answers are displayed but not persisted. |
| 8 | Subject Detail Page      | As a parent, I tap a subject block (e.g., Math) and see two tabs: **Active** (unresolved wrong/partial answers) and **Resolved** (questions I've marked as resolved). I can resolve, unresolve, or **permanently delete** any question. Deleting a question hard-removes it from the database. |
| 9 | Practice Question Gen    | On either the Active or Resolved tab, I click a **"Generate Practice"** button that generates similar questions for **all** questions in that tab. Each question produces 2 similar questions by default (configurable multiplier). Example: 5 active questions × default 2 = 10 practice questions. Each generation consumes 1 AI token. |
| 10| Weakness Report          | On the subject detail page, I can generate a **Weakness Report** that groups all wrong/partial questions by topic, shows error counts per topic, and highlights the weakest areas. A **"Practice Weaknesses"** button generates targeted practice questions focused on the weakest topics. Each report generation consumes 1 AI token. |
| 11| A4 Print View            | As a parent, I can preview and print (or save as PDF) the generated practice worksheets and weakness reports in A4 format, with answer key on a separate page. |

### Phase 2 — Enhancements

| # | Feature                       | Description                                                   |
|---|-------------------------------|---------------------------------------------------------------|
| 12| Progress Dashboard            | Visual charts showing improvement trends and weak areas per subject over time. |
| 13| Difficulty Tuning             | Auto-adjust question difficulty based on error patterns and improvement. |
| 14| Multiple AI Provider Support  | Switch between OpenAI, Gemini, or other LLMs per request for cost/quality balance. |
| 15| Offline Mode                  | Cache recent results; queue submissions when offline and auto-retry on reconnect. |
| 16| Push Notifications            | Notify parent when AI analysis is complete (via Web Push API). |
| 17| Multi-language Feedback       | AI feedback in English, Chinese, or both (configurable per child profile). |

### Phase 3 — Growth

| # | Feature                       | Description                                                   |
|---|-------------------------------|---------------------------------------------------------------|
| 18| Teacher / Tutor Role          | Allow teachers to view student progress (with parent consent).|
| 19| Gamification                  | Badges, streaks, and rewards for practice completion.         |
| 20| Community Question Bank       | Parents share and rate practice question sets.                |
| 21| Subscription Plans            | Monthly subscription tiers with included token allowances (e.g., Basic 50/mo, Pro 200/mo). |
| 22| Scan History Re-check         | Re-submit previously scanned photos for a fresh AI re-analysis. |

---

## 4. Milestones & Timeline

> Estimates assume a team of 2 developers (1 frontend, 1 backend). Solo developer should multiply durations by ~1.5x.

| Milestone        | Scope                                                     | Duration (est.) | Dependencies |
| ---------------- | --------------------------------------------------------- | --------------- | ------------ |
| **M0 — Setup**   | Repo, Coolify server setup, CI/CD (GitHub → Coolify webhook), Dockerfiles, dev environment, PWA scaffold, DB schema, docker-compose for local dev | Week 1–2  | None |
| **M1 — Auth & Tokens** | Registration (with 3 free tokens), login, JWT flow, child profile CRUD (P1–P6), dashboard home page with 5 subject blocks + camera button, token balance system, token purchase flow, quota-check middleware | Week 3–5  | M0 |
| **M2 — Camera**  | Camera integration (getUserMedia + file input fallback), multi-photo selection (max 10) with ordering, image quality validation, batch upload to object storage | Week 6–7 | M0 |
| **M3 — AI Core** | Backend prompt engineering (auto subject detection for 5 subjects), AI API integration, response parsing, error handling & retry logic, token deduction, save only wrong/partial answers to DB | Week 8–10 | M1, M2 |
| **M4 — Records** | Wrong-answer storage, subject detail page (active/resolved lists), resolve/delete actions, filtering/sorting, topic tagging | Week 11–12 | M3 |
| **M5 — Practice**| Generate-all practice (×2 default), A4 print layout with answer key | Week 13–14 | M4 |
| **M6 — Reports** | Weakness report per subject (AI-powered topic analysis, weakness ranking), "Practice Weaknesses" one-click generation | Week 15–16 | M5 |
| **M7 — Polish**  | PWA install flow, offline basics, UX polish, cross-device testing (iOS Safari + Android Chrome), bug fixes | Week 17–18 | M6 |
| **M8 — Beta**    | Internal testing, real-user feedback loop, performance tuning, cost monitoring | Week 19 | M7 |
| **M9 — Launch**  | Production deployment on Coolify, monitoring dashboards, DNS cutover, public release | Week 20–21 | M8 |

---

## 5. Team & Roles

| Role                  | Responsibility                                                |
| --------------------- | ------------------------------------------------------------- |
| Product Owner         | Requirements, prioritisation, acceptance criteria             |
| Frontend Developer    | PWA (React/Vue + TypeScript), camera, print layout            |
| Backend Developer     | API server, AI integration, database, prompt engineering      |
| UI/UX Designer        | Wireframes, responsive mobile design, print stylesheet        |
| QA / Tester           | Test plans, cross-device testing (iOS Safari, Android Chrome) |
| DevOps                | Coolify setup, CI/CD, Docker, VPS infra, monitoring, security |

---

## 6. Risks & Mitigations

| Risk                                  | Impact | Likelihood | Mitigation                                                        |
| ------------------------------------- | ------ | ---------- | ----------------------------------------------------------------- |
| iOS Safari PWA camera limitations     | High   | Medium     | Test early on real devices; fallback to `<input type="file" capture>` if getUserMedia fails; maintain a device compatibility matrix |
| AI hallucination / incorrect grading  | High   | Medium     | Confidence scoring in prompt; "Report incorrect result" button for parent feedback; prompt guardrails and output validation |
| AI API cost overrun                   | Medium | High       | Rate limiting per user; token budget tracking per account; cache identical image hashes; alert on spend thresholds |
| Image quality / OCR accuracy          | Medium | High       | Client-side image quality check (blur detection, minimum resolution); capture guidelines UI; auto-rotate and compress before upload |
| Latency of AI response                | Medium | Medium     | Async processing with progress indicator; timeout after 30s with retry option; consider streaming partial results |
| Data privacy (children's data)        | High   | Low        | Comply with COPPA / PDPA / local regulations; minimal PII; encrypt at rest; auto-delete images after 30 days |
| AI provider outage                    | High   | Low        | Fallback to secondary provider; queue submissions for retry; display graceful error with estimated wait time |
| Handwriting recognition accuracy      | Medium | High       | Scope MVP to printed/typed homework; handwriting support as Phase 2 stretch goal; inform users of limitation |

---

## 7. Budget Estimate (MVP)

| Item                  | Monthly Cost (est.)  | Notes                                     |
| --------------------- | -------------------- | ----------------------------------------- |
| AI API (OpenAI GPT-4o)| $200–500             | ~1,000 scans/month at ~$0.03–0.05/scan   |
| VPS (Coolify host)    | $20–50               | e.g. Hetzner CX32 (4 vCPU, 8 GB RAM); runs all services via Coolify |
| Object storage        | $5–20                | MinIO on same VPS, or external S3/R2      |
| Domain + SSL          | $15/year             | Cloudflare free CDN; SSL auto via Coolify/Let's Encrypt |
| Payment processing    | ~2.9% + $0.30/txn    | Stripe fees on token purchases            |
| **Total**             | **~$240–585/month**  | Offset by token purchase revenue; lower infra cost vs managed PaaS |

### Revenue Model

Users purchase AI tokens to use the service. Each token = 1 AI request (homework scan or practice generation).

| Package    | Tokens | Price   | Revenue per token |
| ---------- | ------ | ------- | ----------------- |
| Starter    | 10     | $1.99   | $0.199            |
| Standard   | 50     | $7.99   | $0.160            |
| Bulk       | 200    | $24.99  | $0.125            |

---

## 8. Success Metrics

| Metric                          | Target (MVP)         |
| ------------------------------- | -------------------- |
| Registration → first scan       | > 60 % within 24 hrs|
| AI answer accuracy              | > 90 %               |
| Average response time           | < 10 seconds         |
| Practice sheet generation usage | > 30 % of active users weekly |
| App install (Add to Home Screen)| > 40 % of registered users    |
| 7-day retention                 | > 50 %               |
| AI cost per scan                | < $0.05 average      |

---

## 9. Open Questions

1. ~~Which subjects to support in MVP?~~ **Decision: All 5 Singapore primary subjects from day one — Math, English, Science, Chinese, Higher Chinese. AI auto-detects subject.**
2. ~~Free tier limits?~~ **Decision: 3 free AI tokens on registration. Each homework scan or practice generation costs 1 token. Must purchase more when exhausted.**
3. ~~Target market?~~ **Decision: Singapore primary school students (P1–P6). Comply with PDPA.**
4. Language of AI feedback — English, Chinese, or both? (Recommend: English for Math/English/Science, Chinese for Chinese/Higher Chinese, configurable)
5. Max number of children per parent account? (Recommend: 5)
6. Token pricing tiers — how many tokens per price point? (Recommend: 10 for $1.99, 50 for $7.99, 200 for $24.99)
7. Payment gateway — Stripe, PayPal, or both?
8. Need integration with any school LMS?
9. Should AI vision models handle handwritten answers in MVP, or only printed/typed? (Recommend: printed only for MVP, handwriting in Phase 2)

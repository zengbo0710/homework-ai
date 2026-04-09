# M1: Auth, Token System, Child Profiles & Dashboard Design

## Goal

Implement JWT authentication, account-wide token balance display, child profile CRUD with avatar upload, and a two-level dashboard (child selector → child subject view).

---

## Section 1: API Routes & Auth

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Create user, grant 3 free tokens, return `{ accessToken, refreshToken }` |
| POST | `/api/auth/login` | Verify bcrypt password, return `{ accessToken, refreshToken }` |
| POST | `/api/auth/refresh` | Verify refreshToken (DB lookup), return new `{ accessToken }` |
| POST | `/api/auth/logout` | Delete refreshToken from DB |

### Token Strategy

- **accessToken**: JWT signed with `JWT_SECRET`, 15-min TTL, stored in React context (memory only — never persisted)
- **refreshToken**: opaque UUID v4, 30-day TTL, stored in `RefreshToken` table + localStorage
- **On app load**: read `refreshToken` from localStorage → call `POST /auth/refresh` → hydrate auth context
- **Password hashing**: bcrypt cost factor 10

### JWT Payload

```json
{ "sub": "<userId>", "iat": 1234567890, "exp": 1234568790 }
```

### Error Responses

- `400` — validation error (missing fields, invalid email format)
- `401` — wrong password or expired/invalid refresh token
- `409` — email already registered (register endpoint)

---

## Section 2: Child Profiles & Avatar Upload

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/children` | List children for authenticated user |
| POST | `/api/children` | Create child (max 5 enforced server-side) |
| PUT | `/api/children/:id` | Update name and/or gradeLevel |
| DELETE | `/api/children/:id` | Delete child + cascade (submissions, practice sessions) |
| POST | `/api/children/:id/avatar` | Multipart upload → resize to 256×256 JPEG → save to `uploads/avatars/<uuid>.jpg` → return `{ avatarUrl }` |

### Static File Serving

```
GET /uploads/avatars/*
```

Served by `@fastify/static` from `packages/api/uploads/`. Directory created at startup if absent.

### Avatar Processing

- Library: `sharp` — resize input to 256×256 JPEG, quality 80
- Filename: `<uuid v4>.jpg` (new UUID per upload, old file deleted)
- Stored at: `packages/api/uploads/avatars/<uuid>.jpg`

### Child Payload

```typescript
{ name: string, gradeLevel: 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6' }
```

Avatar is updated separately via the dedicated avatar endpoint — name/grade edits do not require re-uploading the image.

### Ownership Enforcement

All child routes verify that the `Child.userId` matches the authenticated user. Returns `403` otherwise.

### Max 5 Children

`POST /api/children` counts existing children; returns `422 { error: 'max_children_reached' }` if count ≥ 5.

---

## Section 3: Frontend Pages & Navigation

### Route Map

| Path | Component | Notes |
|------|-----------|-------|
| `/login` | `LoginPage` | Form: email + password |
| `/register` | `RegisterPage` | Form: email + password |
| `/dashboard` | `ChildSelectorPage` | Grid of child cards + "Add Child" button |
| `/dashboard/:childId` | `ChildDashboardPage` | 5 subject blocks + camera FAB placeholder |
| `/children/new` | `AddChildPage` | Form: name, grade selector, avatar upload |
| `/children/:id/edit` | `EditChildPage` | Pre-filled form |

### Auth Context (`AuthContext`)

```typescript
interface AuthContextValue {
  user: { id: string; email: string } | null;
  accessToken: string | null;
  login(tokens: { accessToken: string; refreshToken: string }): void;
  logout(): void;
}
```

- On mount: reads `refreshToken` from localStorage, calls `/auth/refresh`, sets `accessToken` in context
- `logout()`: clears context + removes `refreshToken` from localStorage + calls `/auth/logout`

### Protected Routes

`<ProtectedRoute>` wrapper: if no valid `accessToken` in context, redirects to `/login`.

### AppShell Updates

Token balance fetched from `GET /api/tokens/balance` on auth context hydration. Displayed as "Tokens: N" in the header (replaces the "–" placeholder from M0).

### ChildSelectorPage

- Grid of child cards: avatar (or placeholder icon), name, grade badge
- "Add Child" button disabled (greyed) when child count ≥ 5
- Tap child card → navigate to `/dashboard/:childId`

### ChildDashboardPage

Five subject blocks (tappable cards): Math, English, Science, Chinese, Higher Chinese. Each shows subject icon + name. Tapping a block will navigate to `/scan` (wired up in M2 — disabled/placeholder in M1).

Camera FAB: fixed bottom-right, navigates to `/scan` (placeholder in M1).

### PurchaseModal (stub)

Accessible from AppShell token display. Shows token packages from `GET /api/tokens/packages`. "Buy" buttons display "Coming Soon" — no payment processing in M1.

---

## Section 4: Token System & Quota Middleware

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/tokens/balance` | Return `{ balance: number }` for authenticated user |
| GET | `/api/tokens/packages` | Return packages array from `systemConfig.token_packages` |
| POST | `/api/tokens/purchase` | `501 Not Implemented` (Stripe wired in later milestone) |

### Quota Middleware

```typescript
function checkTokens(cost: number): FastifyMiddleware
```

- Reads `userId` from verified JWT
- Fetches `tokenBalance` from `User` table
- If `balance < cost` → `402 Payment Required { error: 'insufficient_tokens' }`
- Applied to AI routes in M2+ — defined in M1, not yet mounted on any route

### Token Balance Storage

`User.tokenBalance Int @default(0)` — already in M0 schema. Account-wide, shared across all children. Full transaction ledger deferred to a later milestone.

---

## Section 5: Testing Strategy

### API Tests (Vitest + real MySQL)

- `auth.test.ts`: register success, duplicate email (409), login success, wrong password (401), refresh flow, logout invalidates token
- `children.test.ts`: CRUD happy paths, max-5 enforcement (422), ownership check (403 on another user's child), avatar upload returns URL
- `tokens.test.ts`: balance endpoint, packages endpoint, quota middleware with sufficient balance, quota middleware with zero balance (402)

### Web Tests (Vitest + jsdom + Testing Library)

- `AuthContext.test.tsx`: hydration from localStorage, logout clears state and localStorage
- `ChildSelectorPage.test.tsx`: renders child cards, "Add Child" visible, disabled when 5 children
- `ChildDashboardPage.test.tsx`: renders all 5 subject blocks
- `ProtectedRoute.test.tsx`: redirects to `/login` when unauthenticated

### Test Database

API tests use `DATABASE_URL` pointing to `homework_ai_test`. Schema applied via `prisma migrate deploy` before each suite. Each test file truncates relevant tables in `beforeEach`.

---

## Dependencies Added in M1

| Package | Location | Purpose |
|---------|----------|---------|
| `bcrypt` + `@types/bcrypt` | api | Password hashing |
| `jsonwebtoken` + `@types/jsonwebtoken` | api | JWT sign/verify |
| `uuid` + `@types/uuid` | api | Refresh token generation |
| `@fastify/multipart` | api | Avatar file upload |
| `@fastify/static` | api | Serve uploaded files |
| `sharp` | api | Avatar resize/compress |
| `axios` | web | HTTP client for API calls |

---

## Out of Scope (M1)

- Stripe payment processing (stubbed)
- Email verification
- Password reset flow
- Social login (Google/Apple)
- E2E tests
- Token transaction history/ledger

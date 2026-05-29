# Design: Auth + Onboarding

## Technical Approach

Add Supabase Auth (email/password) with `@supabase/ssr` for App Router cookie-based session management. Migrate `participantes` from wallet-only identity to a `user_id → auth.users` FK model. Protect `/(dashboard)` routes via middleware. Introduce AuthProvider at root level, three new pages (`/login`, `/register`, `/onboarding`), and a `POST /api/participantes` route following the existing service-role pattern.

Reference: proposal intent (scope, capabilities), migration 001 schema (existing RLS, table structure), existing API route pattern (Zod validation, service-role client, Spanish error codes).

---

## Architecture Decisions

### Decision 1: `@supabase/ssr` for session management

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `@supabase/ssr` (createBrowserClient / createServerClient) | Handles cookie lifecycle automatically; official SDK for Next.js App Router; replaces manual cookie parsing | ✅ **Chosen** |
| `@supabase/supabase-js` + manual cookie handling | More control but more surface area for cookie bugs; already have `@supabase/supabase-js` v2.106.1 as dep; no middleware helpers | ❌ Rejected |

**Rationale**: `@supabase/ssr` is the canonical solution for App Router. It wraps `@supabase/supabase-js` and handles same-site cookie refresh, PKCE flow redirects, and middleware session checks — code we'd otherwise have to write and test ourselves.

### Decision 2: Service-role for `POST /api/participantes`

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Service-role client (existing pattern) | Bypasses RLS; consistent with all existing API routes; no RLS policy changes needed for insert | ✅ **Chosen** |
| RLS-only insert via anon client | Requires updating RLS policies with `auth.uid()` and `auth.jwt()`; breaks existing pattern; `user_id` FK not set yet | ❌ Rejected |

**Rationale**: All existing API routes (`/api/avales`, `/api/desembolso`) use the service-role client. Adding a route that uses RLS for permission would be inconsistent and brittle during the migration window. The service-role route reads the authenticated user from the session cookie (server-side), validates they own the session, and inserts with the correct `user_id`.

### Decision 3: Singleton auth clients (same pattern as existing clients)

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Singleton pattern | Consistent with `client.ts` and `client-browser.ts`; @supabase/ssr docs show module-level instantiation ✅ | ✅ **Chosen** |
| Per-request instance | More idiomatic for SSR but diverges from existing codebase convention | ❌ Rejected |

**Rationale**: The existing codebase uses module-level singletons (`getSupabaseClient`, `getBrowserClient`). Moving to per-request instances in auth-related code but not the rest would be confusing. @supabase/ssr's `createBrowserClient` and `createServerClient` are designed to be called once per module.

### Decision 4: AuthProvider as client component at root layout

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Client component wrapper in `layout.tsx` | Simple; wraps all routes; auth state available everywhere via `useAuth()` hook | ✅ **Chosen** |
| Per-page auth fetching | Server component per page; more boilerplate; no shared user context; harder to handle session expiry | ❌ Rejected |

**Rationale**: Auth state (user, session) is global app state. A provider at root level avoids prop drilling and duplicate session fetch calls. The existing layout is minimal — wrapping it in a client boundary is low-cost.

### Decision 5: MIDDLEWARE route protection + server client

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `@supabase/ssr` `createServerClient` in middleware | Built-in cookie exchange; knows how to refresh tokens; documented pattern | ✅ **Chosen** |
| JWT decode from cookie manually | Fragile; must replicate Supabase cookie format; no token refresh | ❌ Rejected |

**Rationale**: Middleware runs on every request. Using `@supabase/ssr`'s `createServerClient` with `getAll`/`setAll` cookie handlers is the documented pattern and handles session refresh transparently. Route matcher restricts middleware to `/(dashboard)/*` paths only.

---

## Data Flows

### Flow 1: Registration

```
┌──────────┐    ┌──────────────┐    ┌──────────────┐    ┌───────────┐
│ Register  │    │ supabase-js  │    │   Supabase   │    │  /auth/   │
│  Form     │───→│ auth-client  │───→│    Auth      │───→│  callback │
└──────────┘    └──────────────┘    └──────┬───────┘    └───────────┘
                                           │                    │
                              ┌────────────┘                    │
                              │  Confirmation email              │
                              │  sent to user                    │
                              │                                  │
                              │  User clicks link ───────────────┘
                              │                         │
                              │              ┌──────────┘
                              │              ▼
                              │    ┌──────────────────┐
                              │    │  Set session     │
                              │    │  cookie via SSR  │
                              │    └──────┬───────────┘
                              │           │
                              │           ▼
                              │    ┌──────────────────┐
                              │    │  Redirect to     │
                              │    │  /onboarding     │
                              │    └──────────────────┘
```

### Flow 2: Login

```
┌──────────┐    ┌──────────────┐    ┌──────────────┐
│  Login   │    │ supabase-js  │    │   Supabase   │
│  Form    │───→│ auth-client  │───→│    Auth      │
└──────────┘    └──────────────┘    └──────┬───────┘
                                           │
                               ┌───────────┘
                               ▼
                    ┌─────────────────────┐
                    │  Session cookie     │
                    │  set by supabase-js │
                    │  (httpOnly, secure) │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼─────────┐
                    │  Check participantes│
                    │  has user_id = uid  │
                    │  (via /api/         │
                    │   participantes?    │
                    │   check_existing)  │
                    └──────────┬──────────┘
                               │
                      ┌────────┴────────┐
                      ▼                 ▼
               ┌──────────┐    ┌────────────┐
               │ Has row  │    │ No row     │
               │ → /      │    │ → /onboard │
               │   aprobacion│  │   ing     │
               └──────────┘    └────────────┘
```

### Flow 3: Protected Route (Middleware)

```
Browser hits /aprobacion
         │
         ▼
┌─────────────────────┐
│  middleware.ts      │
│                     │
│  Read cookie via    │
│  createServerClient │
│  (from @supabase/ssr)│
└──────────┬──────────┘
           │
     ┌─────┴─────┐
     ▼           ▼
┌─────────┐ ┌─────────────┐
│ Session │ │ No session  │
│ exists  │ │             │
└────┬────┘ │ Redirect    │
     │      │ to /login?  │
     │      │ redirect=   │
     │      │ /aprobacion │
     │      └─────────────┘
     ▼
┌─────────────┐
│ Allow       │
│ through to  │
│ /aprobacion │
└─────────────┘
```

### Flow 4: Onboarding

```
User on /onboarding (authenticated, no participantes.user_id = auth.uid())
         │
         ▼
┌──────────────────┐
│  Onboarding Form │
│  nombre          │
│  wallet_address  │  ← pre-filled via ConnectWallet button
│  rol             │  ← dropdown: prestamista / prestatario / aval
└────────┬─────────┘
         │ POST /api/participantes
         ▼
┌──────────────────┐
│  Request         │
│  Headers:        │
│  Cookie: session │  (browser sends automatically)
└────────┬─────────┘
         │
         ▼
┌───────────────────────────────────────┐
│  /api/participantes/route.ts         │
│                                      │
│  1. Parse + validate via Zod         │
│  2. Read session from cookie         │
│     via createServerClient           │
│  3. Get auth.uid() from token        │
│  4. Check user_id NOT already taken  │
│  5. INSERT using service-role client │
│     { nombre, wallet_address, rol,   │
│       user_id, activo: true }        │
│  6. Return 201 + row                 │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────┐
│  Redirect to         │
│  /aprobacion         │
│  (now protected,     │
│   user has profile)  │
└──────────────────────┘
```

---

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `package.json` | **Modify** | Add `@supabase/ssr` dependency |
| `src/lib/supabase/auth-client.ts` | **Create** | Browser auth helpers via `createBrowserClient` from `@supabase/ssr` — exports `signUp`, `signIn`, `signOut`, `getAuthSession` |
| `src/lib/supabase/auth-server.ts` | **Create** | Server-side cookie session reader via `createServerClient` from `@supabase/ssr` — exports `getServerUser`, `getServerSession` |
| `src/middleware.ts` | **Create** | Route protection via `createServerClient` with cookie handlers; redirects to `/login?redirect={path}` for unauthenticated requests on `/(dashboard)/*` |
| `src/app/layout.tsx` | **Modify** | Wrap `{children}` with `<AuthProvider>` |
| `src/app/login/page.tsx` | **Create** | Email + password form, loading/error states, link to `/register`, redirect param support |
| `src/app/register/page.tsx` | **Create** | Register form with email + password + confirm, validation, loading spinner, redirect to onboarding flow |
| `src/app/auth/callback/route.ts` | **Create** | GET handler for email confirmation / OAuth callback — exchanges code for session, sets cookie, redirects to `/onboarding` |
| `src/app/onboarding/page.tsx` | **Create** | Protected page — collects nombre, wallet_address, rol; POST to `/api/participantes`; redirects to `/aprobacion` on success |
| `src/app/api/participantes/route.ts` | **Create** | POST handler — validates body, reads session server-side, inserts into `participantes` via service-role client; GET handler — checks if user has a row |
| `src/components/auth/AuthProvider.tsx` | **Create** | Client component with `createContext` — fetches session on mount, provides `{ user, session, signOut, isLoading, isAuthenticated }` |
| `src/components/auth/ConnectWallet.tsx` | **Create** | Detects `window.ethereum`, calls `eth_requestAccounts`, displays connected address or "Connect Wallet" button |
| `src/types/database.ts` | **Modify** | Add `user_id: string` to `ParticipanteRow` |
| `supabase/migrations/003_auth.sql` | **Create** | Add `user_id UUID REFERENCES auth.users(id)`, unique index, rewrite RLS policies, backfill for existing rows |
| `openspec/specs/participant-management/spec.md` | **Modify** | Update RLS requirement from wallet-based to `auth.uid()` |

---

## Interfaces / Contracts

### AuthProvider Context

```typescript
interface AuthContextValue {
  user: User | null;           // Supabase User object
  session: Session | null;     // Supabase Session object
  isLoading: boolean;          // True during initial session fetch
  isAuthenticated: boolean;    // Shortcut for user !== null
  signOut: () => Promise<void>;
}
```

### `auth-client.ts` exports

```typescript
// Browser-side auth helpers (client components, 'use client')
export function getAuthClient(): SupabaseClient;  // Singleton via createBrowserClient
export async function signUp(email: string, password: string): Promise<SignUpResult>;
export async function signIn(email: string, password: string): Promise<SignInResult>;
export async function signOut(): Promise<void>;
export async function getAuthSession(): Promise<Session | null>;
```

### `auth-server.ts` exports

```typescript
// Server-side session helpers (server components, API routes, middleware)
export function getServerClient(cookieStore: RequestCookies): SupabaseClient;
export async function getServerUser(cookieStore: RequestCookies): Promise<User | null>;
export async function getServerSession(cookieStore: RequestCookies): Promise<Session | null>;
```

### `POST /api/participantes` contract

**Request**:
```json
{
  "nombre": "string (required, 1-255 chars)",
  "wallet_address": "0x... (optional, Ethereum address)",
  "rol": "prestamista | prestatario | aval"
}
```

**Response 201**:
```json
{
  "id": "uuid",
  "nombre": "string",
  "wallet_address": "string",
  "rol": "rol_participante",
  "user_id": "uuid",
  "activo": true
}
```

**Response 400**:
```json
{
  "error": "DATOS_INVALIDOS",
  "detail": "mensaje en español"
}
```

**Response 401**:
```json
{
  "error": "NO_AUTENTICADO",
  "detail": "Debes iniciar sesión para completar el registro"
}
```

**Response 409**:
```json
{
  "error": "USUARIO_YA_REGISTRADO",
  "detail": "Este usuario ya tiene un perfil de participante"
}
```

### `GET /api/participantes?check_existing=true`

**Response 200**:
```json
{
  "exists": true,
  "participante": { "id": "uuid", "nombre": "...", "rol": "...", "wallet_address": "..." }
}
```

---

## Testing Strategy

No automated test infrastructure detected (strict TDD: disabled). Testing is manual/E2E via the real Supabase project.

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Middleware | Unauthenticated → redirect; authenticated → pass | Manual: access `/aprobacion` without session, then after login |
| Registration | Email+password signup, confirmation email, callback | Manual: register, check email, click link |
| Onboarding | Form submit creates row, redirects to `/aprobacion` | Manual: complete form, check redirect, verify DB row |
| Login | Successful login, wrong password, unconfirmed email | Manual: test happy path + error cases |
| Wallet connect | MetaMask detection, address display, reconnection | Manual: with/without MetaMask installed |
| API route | Invalid body → 400, duplicate → 409, missing session → 401 | Manual: curl / Postman tests |
| Migration | RLS works with auth.uid(), existing rows backfilled | Manual: test SELECT/INSERT with anon client after auth |

---

## Migration / Rollout

### Migration 003 (`supabase/migrations/003_auth.sql`)

1. **Add column**: `ALTER TABLE participantes ADD COLUMN user_id UUID REFERENCES auth.users(id)`
2. **Create unique index**: `CREATE UNIQUE INDEX idx_participantes_user_id ON participantes (user_id) WHERE user_id IS NOT NULL`
3. **Drop old RLS policies** on `participantes`:
   - `DROP POLICY IF EXISTS participantes_select_authenticated ON participantes`
   - `DROP POLICY IF EXISTS participantes_insert_own ON participantes`
   - `DROP POLICY IF EXISTS participantes_update_own ON participantes`
4. **Create new RLS policies** on `participantes`:
   - `SELECT`: any authenticated user can read
   - `INSERT`: `WITH CHECK (auth.uid() = user_id)` — user can only insert their own row
   - `UPDATE`: `USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)`
5. **Backfill**: `UPDATE participantes SET user_id = ...` — requires manual mapping from wallet to auth.users or a migration script. Document that existing rows without a matching auth.users entry will have `user_id = NULL` (no backfill possible without external mapping).

### Rollout Order

1. Install `@supabase/ssr` → `npm install @supabase/ssr`
2. Create `auth-client.ts` + `auth-server.ts` (no behavioral change yet)
3. Run migration 003 (adds column, rewrites RLS)
4. Deploy middleware (routes start getting protected)
5. Deploy AuthProvider + layout change
6. Deploy `/login`, `/register`, `/auth/callback`
7. Deploy `/api/participantes` + `/onboarding`
8. Deploy `ConnectWallet` component

### Rollback

Reverse order: remove pages → remove middleware → remove AuthProvider → revert migration 003 → uninstall `@supabase/ssr`.

---

## Open Questions

- [ ] Existing `participantes` rows have `wallet_address` but no `user_id`. How do we backfill? Options: manual CSV import with auth.users mapping, or leave NULL and create new rows per user. If participants table already has production data, we need a mapping strategy.
- [ ] The `GET /api/avales` and `GET /api/desembolso` routes use service-role client and fetch from `participantes` freely — those still work after migration since service-role bypasses RLS. But should server-rendered dashboard pages (like `/aprobacion/page.tsx`) switch to the authenticated server client for RLS enforcement? Currently they use service-role. Decision: keep service-role for now (out of scope), address in a separate security audit change.
- [ ] Should `/onboarding` redirect to `/aprobacion` always, or should it redirect based on the user's `rol` (prestamista → different dashboard)? For now: always `/aprobacion`. Can revisit when role-based routing is spec'd.

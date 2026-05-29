# Auth + Onboarding — Implementation Tasks

> Based on specs (`specs.md`), technical design (`design.md`), and existing codebase analysis.
> Total files: 14 (9 new, 4 modified, 1 migration script)
> Rollout priority: Dependencies → Helpers → Migration → Middleware → Provider → Pages → API → Wallet

---

## Phase 1: Dependencies & Environment

### ✅ 1.1 Install `@supabase/ssr`

**What**: Add `@supabase/ssr` to `package.json` dependencies.

**Details**:
- `npm install @supabase/ssr`
- `@supabase/supabase-js` v2.106.1 is already a dependency — no need to reinstall
- `@supabase/ssr` wraps supabase-js and provides `createBrowserClient` / `createServerClient` with automatic cookie lifecycle (same-site refresh, PKCE, middleware helpers)

**Files**: `package.json` (modify)

---

### ✅ 1.2 Add Auth Environment Variables

**What**: Add Supabase Auth URL and Site URL to `.env.local.example` (and ensure `.env.local` has them).

**Details**:
- `NEXT_PUBLIC_SUPABASE_URL` — already exists
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — already exists
- `NEXT_PUBLIC_SITE_URL` — **new**, needed for auth callback redirect. Example: `http://localhost:3000` for dev
- Document that Supabase Auth UI settings must whitelist `{SITE_URL}/auth/callback` as a redirect URL

**Files**: `.env.local.example` (modify), `.env.local` (create or modify, not committed)

---

## Phase 2: Auth Client Helpers

### ✅ 2.1 Create `src/lib/supabase/auth-client.ts`

**What**: Browser-side auth client using `@supabase/ssr`'s `createBrowserClient`.

**Design references**:
- Decision 1: `@supabase/ssr` for session management
- Decision 3: Singleton pattern (same as existing `client.ts` / `client-browser.ts`)
- API Contract: `signUp`, `signIn`, `signOut`, `getAuthSession`

**Implementation details**:
- Module-level singleton via `createBrowserClient` from `@supabase/ssr`
- Read `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from env
- Export:
  - `getAuthClient()` → returns singleton SupabaseClient
  - `signUp(email, password)` → calls `auth.signUp()`, returns typed result
  - `signIn(email, password)` → calls `auth.signInWithPassword()`, returns typed result
  - `signOut()` → calls `auth.signOut()`
  - `getAuthSession()` → calls `auth.getSession()`, returns `Session | null`
- This is a **client-only** module (runs in browser, not server components)

**Edge cases**:
- Missing env vars → throw descriptive error in Spanish (same pattern as `client.ts`)
- Network errors → let caller handle (AuthProvider wraps loading/error)

**Files**: `src/lib/supabase/auth-client.ts` (create)

---

### ✅ 2.2 Create `src/lib/supabase/auth-server.ts`

**What**: Server-side client for middleware, API routes, and server components.

**Design references**:
- Decision 1: `@supabase/ssr` for session management (server variant)
- Decision 3: Singleton pattern NOT possible server-side — needs cookie store per request
- API Contract: `getServerUser`, `getServerSession`

**Implementation details**:
- Import `createServerClient` from `@supabase/ssr`
- `getServerClient(cookieStore: RequestCookies)` — creates a new client instance using:
  - `cookies.getAll()` for reading all cookies
  - `cookies.set()` / `cookies.delete()` for setting cookies on response
- Export:
  - `getServerClient(cookieStore)` → SupabaseClient
  - `getServerUser(cookieStore)` → `User | null` (calls `auth.getUser()`)
  - `getServerSession(cookieStore)` → `Session | null` (calls `auth.getSession()`)
- Use `NextRequest` / `NextResponse` cookies API
  - For middleware: `request.cookies` (getAll/set/delete on NextRequest)
  - For API routes: `new Cookies(request.headers)` or `request.cookies`
- Throws descriptive error if env vars missing (Spanish, same pattern as `client.ts`)

**Edge cases**:
- `auth.getUser()` vs `auth.getSession()` — use `getUser()` for verification (validates JWT with Supabase Auth server), `getSession()` for reading the session token
- Cookie names: `@supabase/ssr` uses `sb-{project-ref}-auth-token` — don't hardcode

**Files**: `src/lib/supabase/auth-server.ts` (create)

---

## Phase 3: Middleware — Route Protection

### ✅ 3.1 Create `src/middleware.ts`

**What**: Route protection middleware that redirects unauthenticated users on `/(dashboard)/*` to `/login?redirect={path}`.

**Design references**:
- Decision 5: `@supabase/ssr` `createServerClient` in middleware (built-in cookie exchange + refresh)
- Flow 3: Protected Route Middleware — session check → allow or redirect

**Implementation details**:
- Use `createServerClient` from `@supabase/ssr` with `cookies.getAll()` / `cookies.setAll()` on the `NextRequest` object
- `matcher` config: `['/(dashboard)/:path*']` — middleware ONLY runs on dashboard routes
- Logic:
  1. Create server client with request cookies
  2. `await supabase.auth.getUser()` to verify the user
  3. If no user → `NextResponse.redirect('/login?redirect=' + encodeURIComponent(request.nextUrl.pathname))`
  4. If user exists → `NextResponse.next()`
- After getting user, call `supabase.auth.getSession()` to ensure the session cookie is refreshed (next/response cookies set automatically by `@supabase/ssr`)
- `cookies.setAll()` in `createServerClient` response handler

**Edge cases**:
- Redirect query param: _must_ be the original path (not full URL) so it works in all environments
- Token refresh: `@supabase/ssr` handles this transparently, but we must call `getUser()` which auto-refreshes if needed
- Middleware runs on every matching request — keep it fast (no DB calls, just JWT verification)

**Files**: `src/middleware.ts` (create)

---

## Phase 4: Auth Provider & Layout

### ✅ 4.1 Create `src/components/auth/AuthProvider.tsx`

**What**: React context provider wrapping the app — exposes user, session, signOut, isLoading, isAuthenticated.

**Design references**:
- Decision 4: Client component at root layout
- API Contract: `AuthContextValue` interface
- Spec: Session Management — session, user, signOut, loading via context

**Implementation details**:
- `'use client'` directive
- Create context with `React.createContext<AuthContextValue>`
- Export `useAuth()` hook (throws if used outside provider)
- Provider component:
  - State: `user`, `session`, `isLoading`
  - On mount: call `getAuthSession()` to check existing session
  - Subscribe to `onAuthStateChange` listener for real-time session updates (login/logout from other tabs)
  - `signOut` function: calls `auth-client.signOut()`, clears state
  - Cleanup: unsubscribe from `onAuthStateChange` on unmount
- Value shape:
  ```typescript
  {
    user: User | null,
    session: Session | null,
    isLoading: boolean,
    isAuthenticated: boolean,
    signOut: () => Promise<void>,
  }
  ```

**Edge cases**:
- Initial render: `isLoading = true` — pages must handle this (show spinner, not redirect)
- Session expiry mid-session: `onAuthStateChange` fires with `SIGNED_OUT` event
- Multiple tabs: `onAuthStateChange` syncs across tabs automatically via broadcast

**Files**: `src/components/auth/AuthProvider.tsx` (create)

---

### ✅ 4.2 Update `src/app/layout.tsx`

**What**: Wrap `{children}` with `<AuthProvider>`.

**Design references**:
- Decision 4: AuthProvider wraps root layout

**Implementation details**:
- This is a server component — wrap `{children}` with `<AuthProvider>` inside `<body>`
- Impact: entire app tree moves to client-side for auth context. Acceptable tradeoff since auth state is global

**Files**: `src/app/layout.tsx` (modify)

---

## Phase 5: Auth Pages

### ✅ 5.1 Create `src/app/login/page.tsx`

**What**: Email + password login form with error states, loading spinner, and redirect support.

**Design references**:
- Flow 2: Login — form → Supabase Auth → session → redirect to /onboarding or original route
- Spec: Login — valid credentials → session + redirect; invalid → inline error

**Implementation details**:
- `'use client'` page component
- URL params: read `?redirect=` for post-login redirect (default: `/`)
- Form fields: email (type=email), password (type=password)
- Submit handler:
  1. `signIn(email, password)` from auth-client
  2. On success → redirect to `redirect` param or check `/api/participantes?check_existing=true`
     - If exists → redirect to redirect param or `/aprobacion`
     - If doesn't exist → redirect to `/onboarding`
  3. On error → show inline error message derived from Supabase error code
- States:
  - Idle: form visible, button enabled
  - Loading: button shows spinner, inputs disabled
  - Error: red inline message below form
- Link to `/register` for users without an account

**Edge cases**:
- Unconfirmed email: Supabase returns specific error — show "Revisa tu correo para confirmar la cuenta"
- Network error: show "Error de conexión, intenta de nuevo"
- Rate limiting: show "Demasiados intentos, espera unos segundos"
- Already logged in: redirect immediately (optional optimization via `useAuth().isAuthenticated`)

**Files**: `src/app/login/page.tsx` (create)

---

### ✅ 5.2 Create `src/app/register/page.tsx`

**What**: Registration form with email, password, confirm password — validation, error states, redirect to `/onboarding`.

**Design references**:
- Flow 1: Registration — form → signUp → Supabase email → callback → session → /onboarding
- Spec: Registration — passwords match, min 8 chars, inline errors

**Implementation details**:
- `'use client'` page with local state for form fields
- Client-side validation:
  - Password length ≥ 8 chars
  - Confirmation matches password
  - Email is valid format (HTML5 `type=email` handles basic validation)
- Submit handler:
  1. Validate client-side first (show inline errors before network call)
  2. `signUp(email, password)` from auth-client
  3. On success → show confirmation message "Revisa tu correo electrónico para confirmar la cuenta"
     - With email confirmation disabled in Supabase settings: redirect directly to `/onboarding`
     - With email confirmation enabled: show success state with instructions
  4. On error → show inline error
- States: idle, loading (button spinner + disabled inputs), success (confirmation message), error
- Link to `/login` for returning users

**Edge cases**:
- Email already registered: Supabase returns `UserAlreadyRegistered` — show "Este correo ya está registrado"
- Weak password: Supabase may reject before we do — handle server errors gracefully
- Email confirmation enabled vs disabled: the design assumes confirmation disabled for MVP, but handle both

**Files**: `src/app/register/page.tsx` (create)

---

### ✅ 5.3 Create `src/app/auth/callback/route.ts`

**What**: Route handler that exchanges an auth code for a session (email confirmation, OAuth redirect).

**Design references**:
- Flow 1: Callback — processes code from confirmation email → sets session cookie → redirects to `/onboarding`
- Spec: Auth Callback — exchangeCodeForSession

**Implementation details**:
- Route handler (`export async function GET`) for `GET /auth/callback`
- Read `code` and `next` from URL search params
- Create server client from `@supabase/ssr` with `cookies`
- `await supabase.auth.exchangeCodeForSession(code)` — sets session cookies via the SSR client
- Redirect to `next` param or default to `/onboarding`
- Use `NextResponse.redirect()` for the final response

**Edge cases**:
- Invalid/expired code: `exchangeCodeForSession` throws — redirect to `/login?error=CODIGO_INVALIDO`
- Missing `code` param: redirect to `/login` with error
- `next` param validation: prevent open redirect — verify `next` is a relative path (starts with `/`) or same-origin

**Files**: `src/app/auth/callback/route.ts` (create)

---

## Phase 6: DB Migration

### ✅ 6.1 Create `supabase/migrations/003_auth.sql`

**What**: Add `user_id` column to `participantes`, create unique partial index, rewrite RLS policies, backfill comment.

**Design references**:
- Migration 003 plan in design.md: add column, unique index, drop old policies, create new policies, backfill note
- Spec: RLS Isolation — policies use `auth.uid()` instead of JWT wallet_address claim
- Existing policies in 001_schema.sql: `participantes_select_authenticated`, `participantes_insert_own`, `participantes_update_own`

**Implementation details**:
1. **Add column**:
   ```sql
   ALTER TABLE participantes ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
   ```

2. **Create partial unique index** (prevents duplicate user rows while allowing NULL for legacy):
   ```sql
   CREATE UNIQUE INDEX idx_participantes_user_id ON participantes (user_id) WHERE user_id IS NOT NULL;
   ```

3. **Drop old RLS policies** (idempotent):
   ```sql
   DROP POLICY IF EXISTS participantes_select_authenticated ON participantes;
   DROP POLICY IF EXISTS participantes_insert_own ON participantes;
   DROP POLICY IF EXISTS participantes_update_own ON participantes;
   ```

4. **Create new RLS policies**:
   - **SELECT**: any authenticated user can read all rows (same as before — public directory)
     ```sql
     CREATE POLICY "participantes_select_authenticated"
       ON participantes FOR SELECT
       TO authenticated
       USING (true);
     ```
   - **INSERT**: only their own row (user_id must match auth.uid())
     ```sql
     CREATE POLICY "participantes_insert_own"
       ON participantes FOR INSERT
       TO authenticated
       WITH CHECK (auth.uid() = user_id);
     ```
   - **UPDATE**: only their own row (both USING and CHECK)
     ```sql
     CREATE POLICY "participantes_update_own"
       ON participantes FOR UPDATE
       TO authenticated
       USING (auth.uid() = user_id)
       WITH CHECK (auth.uid() = user_id);
     ```

5. **Comment on backfill**: add SQL comment explaining that existing rows without `user_id` need manual mapping from `wallet_address` to `auth.users.id`, and that the unique partial index allows NULL for unmigrated rows

**Rollback** (document in comments):
```sql
-- Rollback:
-- DROP POLICY IF EXISTS participantes_update_own ON participantes;
-- DROP POLICY IF EXISTS participantes_insert_own ON participantes;
-- DROP POLICY IF EXISTS participantes_select_authenticated ON participantes;
-- ALTER TABLE participantes DROP COLUMN user_id;
-- DROP INDEX IF EXISTS idx_participantes_user_id;
-- Re-create old policies from 001_schema.sql
```

**Files**: `supabase/migrations/003_auth.sql` (create)

---

## Phase 7: API Route — `/api/participantes`

### ✅ 7.1 Create `src/lib/validations/participantes.ts`

**What**: Zod validation schemas for the participantes API route.

**Details**:
- `CrearParticipanteSchema`: validates POST body
  - `nombre`: `z.string().min(1).max(255)`
  - `wallet_address`: `z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional()`
  - `rol`: `z.enum(['prestamista', 'prestatario', 'aval'])`
- `CheckParticipanteSchema`: validates GET query params
  - `check_existing`: `z.literal('true').optional()`

**Files**: `src/lib/validations/participantes.ts` (create)

---

### ✅ 7.2 Create `src/app/api/participantes/route.ts`

**What**: POST handler — validates body, reads session server-side, inserts row via service-role client. GET handler — checks if authenticated user already has a participantes row.

**Design references**:
- Decision 2: Service-role for POST (consistent with existing API route pattern)
- Flow 4: Onboarding — POST with session cookie → read uid → service-role INSERT
- API Contract: POST and GET contracts defined in design.md
- Pattern from existing routes: `avales/route.ts` (Zod validation, service-role client, Spanish error codes)

**Implementation details**:

**POST**:
1. Parse JSON body (catch invalid JSON → 400 `CUERPO_INVALIDO`)
2. Validate with `CrearParticipanteSchema` (400 `DATOS_INVALIDOS`)
3. Get server client from `auth-server.ts` using `request.cookies`
4. `auth.getUser()` → if no user → 401 `NO_AUTENTICADO`
5. Check if user already has a row via `getSupabaseClient()` select with `user_id = authUser.id` → if exists → 409 `USUARIO_YA_REGISTRADO`
6. INSERT via `getSupabaseClient()` (service-role) with: `{ nombre, wallet_address, rol, user_id: authUser.id, activo: true }`
7. Return 201 with the created row

**GET (?check_existing=true)**:
1. Get server client, check auth
2. If not authenticated → return `{ exists: false }` (not an error — caller can decide behavior)
3. Select from `participantes` WHERE `user_id = authUser.id`
4. Return `{ exists: boolean, participante?: ParticipanteRow }`

**Response format** (same as existing API routes):
- Success: `NextResponse.json(data, { status })`
- Error: `NextResponse.json({ error: 'CODIGO', detail: 'mensaje' }, { status })`

**Files**: `src/app/api/participantes/route.ts` (create)

---

## Phase 8: Onboarding Page

### ✅ 8.1 Create `src/app/onboarding/page.tsx`

**What**: Protected form page for new users to create their participant profile (nombre, wallet_address, rol).

**Design references**:
- Flow 4: Onboarding — form → POST /api/participantes → redirect to /aprobacion
- Spec: Profile Creation — form fields, validation, redirect after success
- Spec: Completion Check — redirect away if user already has row

**Implementation details**:
- `'use client'` page
- Use `useAuth()` hook to get user state
- On page load (or immediately if user loaded):
  1. GET `/api/participantes?check_existing=true`
  2. If `exists === true` → `router.push('/aprobacion')` — user already has profile
  3. If `isLoading` → show full-page spinner
- Form fields:
  - `nombre`: text input (required, max 255)
  - `wallet_address`: text input (optional, pre-filled by WalletConnect)
  - `rol`: select dropdown with options: `prestamista`, `prestatario`, `aval`
  - + ConnectWallet button (see Phase 8)
- Validation (client-side before POST):
  - `nombre` not empty
  - `rol` selected
  - `wallet_address` is valid Ethereum address if provided
- Submit handler:
  1. POST `/api/participantes` with JSON body
  2. On 201 → `router.push('/aprobacion')`
  3. On 400/409 → show inline validation error or conflict message
  4. On 401 → redirect to `/login` (session expired)
- States: loading check, form idle, form submitting (spinner on button), error, redirecting

**Edge cases**:
- Session expires while on the form: API returns 401 → redirect to login
- Double submit: disable button during request
- User refreshes mid-onboarding: check again on mount and redirect if row exists

**Files**: `src/app/onboarding/page.tsx` (create)

---

## Phase 9: Wallet Connect Component

### ✅ 9.1 Create `src/components/auth/WalletConnectButton.tsx`

**What**: Button that detects `window.ethereum`, connects to the wallet, and provides the address to the parent form.

**Design references**:
- Spec: Wallet Connection — detect ethereum, request accounts, pre-fill field
- Edge case: No wallet detected → disabled button with "No hay wallet detectada"

**Implementation details**:
- `'use client'` component
- Props: `onAddressChange: (address: string) => void` — callback to parent (onboarding form)
- State: `address: string | null`, `isConnecting: boolean`, `hasWallet: boolean`
- On mount: check `typeof window !== 'undefined' && window.ethereum`
  - If yes → `hasWallet = true`, show "Connect Wallet" button
  - If no → `hasWallet = false`, show disabled "No hay wallet detectada" button
- On click:
  1. `setIsConnecting(true)`
  2. `await window.ethereum.request({ method: 'eth_requestAccounts' })`
  3. Extract first account address
  4. `setAddress(address)`, call `onAddressChange(address)`
  5. Handle errors (user rejects, network error)
- Display:
  - Connected: show truncated address (`0x1234...5678`) with a green dot + "Conectado"
  - Connecting: show spinner
  - Not connected: show "Conectar Wallet" button
  - No wallet: show disabled "No hay wallet detectada"

**Edge cases**:
- User rejects the MetaMask popup: catch error, reset isConnecting, show "Conexión rechazada"
- Multiple accounts: use the first one (`accounts[0]`)
- Account change while on page: listen for `accountsChanged` event and update address
- SSR safety: `typeof window !== 'undefined'` guard

**Files**: `src/components/auth/WalletConnectButton.tsx` (create)

---

## Phase 10: Types & Verification

### ✅ 10.1 Update `src/types/database.ts`

**What**: Add `user_id` to `ParticipanteRow` interface.

**Details**:
```typescript
export interface ParticipanteRow {
  id: string;
  created_at: string;
  wallet_address: string;
  nombre: string;
  rol: RolParticipante;
  user_id: string;          // NEW — references auth.users(id)
  score_reputacion: number;
  activo: boolean;
}
```

**Impact**: Existing code that constructs `ParticipanteRow` objects or selects from DB will now include `user_id`. No breaking change since it's additive.

**Files**: `src/types/database.ts` (modify)

---

### ✅ 10.2 Update `.env.example` with Auth Vars

**What**: Add `NEXT_PUBLIC_SITE_URL` to `.env.local.example`.

**Details**:
```ini
# --- Auth ---

# URL base del sitio (para redirects de Supabase Auth)
# En desarrollo: http://localhost:3000
# En producción: https://tudominio.com
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

**Files**: `.env.local.example` (modify)

---

### ✅ 10.3 Update Main Spec File

**What**: Sync the RLS requirement change from delta spec to the main participant-management spec.

**Details**:
- In `openspec/specs/participant-management/spec.md`, update the RLS requirement:
  - Change `request.jwt.claims->>wallet_address` to `auth.uid()`
  - Add `user_id` column requirement

**Files**: `openspec/specs/participant-management/spec.md` (modify)

---

### ✅ 10.4 TypeScript Verification

**What**: Run type checker to ensure all code compiles.

```bash
npx tsc --noEmit
```

**Check for**:
- Import path correctness (`@/` aliases)
- `ParticipanteRow` usage — ensure all consumers handle the new `user_id` field
- `@supabase/ssr` types compatibility with existing `@supabase/supabase-js` version
- Route handler return types (NextResponse / Response)
- Client component boundaries (server components importing client-only modules)

**Fix any errors** before proceeding to next phase.

---

## Rollout Order Summary

| Step | Phase | What | Reversible |
|------|-------|------|------------|
| 1 | 1 | Install `@supabase/ssr` + env vars | No (npm) |
| 2 | 2 | Auth helpers (`auth-client.ts`, `auth-server.ts`) | No files removed |
| 3 | 6 | Run migration 003 | Yes (rollback SQL) |
| 4 | 3 | Deploy middleware | Yes (remove file) |
| 5 | 4 | AuthProvider + layout wrapper | Yes (remove wrapper) |
| 6 | 5 | Login, register, callback pages | Yes (remove files) |
| 7 | 7 | `/api/participantes` route | Yes (remove file) |
| 8 | 8 | Onboarding page | Yes (remove file) |
| 9 | 9 | WalletConnectButton | Yes (remove file) |
| 10 | 10 | Types + verification | N/A |

> **Note**: Migration (step 3) MUST run BEFORE middleware (step 4) because existing RLS policies reference JWT claims that email auth doesn't provide. Without the migration, RLS would reject all email-authenticated requests.
>
> The auth helpers (step 2) can be created BEFORE the migration — they don't depend on the DB schema.

---

## Dependencies Between Tasks

```
1.1 (@supabase/ssr) ─────┐
                         ├──→ 2.1 (auth-client.ts) ──┐
1.2 (env vars) ──────────┘                          ├──→ 3.1 (middleware) ──┐
                                                    │                       │
                         ┌──────────────────────────┘                       │
                         │                                                   │
2.2 (auth-server.ts) ────┘                                                   │
                                                                            ├──→ 5.1 (login)
6.1 (migration 003) ─────────────────────────────────────────────────────┘   │
                                                                            ├──→ 5.2 (register)
                                                    4.1 (AuthProvider) ──┐  │
                                                    4.2 (layout.tsx) ────┘  │
                                                                           ├──→ 5.3 (callback)
                                                                            │
7.1 (validation schema) ──┐                                                │
                          ├──→ 7.2 (api/participantes/route.ts) ────┐      │
                                                                      ├──→ 8.1 (onboarding)
9.1 (WalletConnect) ──────────────────────────────────────────────────┘      │
                                                                             │
10.1 (database.ts) ──────────────────────────────────────────────────────────┘
10.2 (.env.example) ─────────────────────────────────────────────────────────┘
10.3 (main spec) ────────────────────────────────────────────────────────────┘
10.4 (tsc --noEmit) ─────────────────────────────────────────────────────────┘ (final)
```

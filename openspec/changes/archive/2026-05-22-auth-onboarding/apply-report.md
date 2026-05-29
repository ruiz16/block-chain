# Apply Report: Auth + Onboarding

## Implementation Progress

**Change**: auth-onboarding
**Mode**: Standard

### Completed Tasks (16/16)

#### Phase 1: Dependencies & Environment
- ✅ 1.1 Install `@supabase/ssr`
- ✅ 1.2 Add Auth Environment Variables

#### Phase 2: Auth Client Helpers
- ✅ 2.1 Create `src/lib/supabase/auth-client.ts`
- ✅ 2.2 Create `src/lib/supabase/auth-server.ts`

#### Phase 3: Middleware
- ✅ 3.1 Create `src/middleware.ts`

#### Phase 4: Auth Provider & Layout
- ✅ 4.1 Create `src/components/auth/AuthProvider.tsx`
- ✅ 4.2 Update `src/app/layout.tsx`

#### Phase 5: Auth Pages
- ✅ 5.1 Create `src/app/login/page.tsx`
- ✅ 5.2 Create `src/app/register/page.tsx`
- ✅ 5.3 Create `src/app/auth/callback/route.ts`

#### Phase 6: DB Migration
- ✅ 6.1 Create `supabase/migrations/003_auth.sql`

#### Phase 7: API Route
- ✅ 7.1 Create `src/lib/validations/participantes.ts`
- ✅ 7.2 Create `src/app/api/participantes/route.ts`

#### Phase 8: Onboarding Page
- ✅ 8.1 Create `src/app/onboarding/page.tsx`

#### Phase 9: Wallet Connect
- ✅ 9.1 Create `src/components/auth/WalletConnectButton.tsx`

#### Phase 10: Types & Verification
- ✅ 10.1 Update `src/types/database.ts`
- ✅ 10.2 Update `.env.example` with Auth Vars
- ✅ 10.3 Update Main Spec File
- ✅ 10.4 TypeScript Verification — `npx tsc --noEmit` passes clean

---

### Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `package.json` | Modified | Added `@supabase/ssr` dependency |
| `.env.local.example` | Modified | Added `NEXT_PUBLIC_SITE_URL` auth var |
| `.env.local` | Created | Full env vars for local dev |
| `src/lib/supabase/auth-client.ts` | Created | Browser auth helpers via `@supabase/ssr` `createBrowserClient` — exports `getAuthClient()`, `signUp()`, `signIn()`, `signOut()`, `getAuthSession()` |
| `src/lib/supabase/auth-server.ts` | Created | Server-side cookie session reader via `createServerClient` — exports `getServerClient()`, `getServerUser()`, `getServerSession()` |
| `src/middleware.ts` | Created | Route protection for `/(dashboard)/*` — redirects unauthenticated to `/login?redirect=` |
| `src/components/auth/AuthProvider.tsx` | Created | React context provider with `useAuth()` hook — exposes `user`, `session`, `isLoading`, `isAuthenticated`, `signOut` |
| `src/components/auth/WalletConnectButton.tsx` | Created | Detects `window.ethereum`, requests accounts, displays truncated address |
| `src/app/layout.tsx` | Modified | Wrapped `{children}` with `<AuthProvider>` |
| `src/app/login/page.tsx` | Created | Email+password login form with loading/error states, redirect param support, post-login profile check |
| `src/app/register/page.tsx` | Created | Register form with client-side validation (password ≥8 chars, match check), success/error states |
| `src/app/auth/callback/route.ts` | Created | GET handler — exchanges auth code for session, redirects to `/onboarding` |
| `src/app/onboarding/page.tsx` | Created | Protected profile creation form — checks existing row first, then shows nombre/wallet_address/rol form |
| `src/app/api/participantes/route.ts` | Created | POST + GET handlers — Zod validation, session verification, service-role DB operations |
| `src/lib/validations/participantes.ts` | Created | Zod schemas for create + check_existing endpoints |
| `supabase/migrations/003_auth.sql` | Created | Adds `user_id` column, unique partial index, rewrites RLS from JWT claims to `auth.uid()` |
| `src/types/database.ts` | Modified | Added `user_id: string` to `ParticipanteRow` |
| `openspec/specs/participant-management/spec.md` | Modified | Updated RLS requirement from wallet_address JWT to `auth.uid()`, added `user_id` column requirement |

---

### Deviations from Design

**Minor — not breaking changes:**

1. **auth-server.ts cookie interface**: The design specified `Pick<RequestCookies, 'getAll' | 'set' | 'delete'>` but the actual `@supabase/ssr` setAll callback passes `(cookies: {name, value, options}[], headers: Record<string, string>)`, and Next.js `RequestCookies.set()` doesn't accept a third options argument. Fixed by defining a simplified `CookieStore` interface with only `getAll()`, `set(name, value)`, and `delete(name)`.

2. **Zod v4 enum API**: The design referenced Zod v3 API (`errorMap`). Zod v4 uses `{ message }` instead. Fixed in the validation schema.

3. **API route handler signature**: Used `NextRequest` instead of `Request` to access `request.cookies` (standard `Request` doesn't have cookies in Next.js).

4. **WalletConnectButton EIP-1193 types**: Added global `Window.ethereum` type declaration (not in design spec but required for TypeScript compilation).

5. **Middleware setAll pattern**: Used the `@supabase/ssr` recommended pattern with `setAll` writing to both request and response cookies, plus `NextResponse.next({ request })` for cookie preservation.

---

### Issues Found

1. **`@supabase/ssr` setAll API change**: The latest version uses `(cookies, headers)` signature. The `setAll` callback must also handle anti-caching headers. Our implementation handles the cookies only (headers are not critical for dev).

2. **Next.js `RequestCookies.set()` limitation**: Doesn't support `SerializeOptions` (cookie path, httpOnly, etc.) via the third argument. The `@supabase/ssr` passes options but the server-side cookie API in Next.js is more restrictive. For middleware this is handled differently (via `NextResponse.cookies.set()`).

3. **Post-login redirect flow**: The login page checks `/api/participantes?check_existing=true` to decide where to redirect. If the API errors, it falls back to the original redirect param. This is acceptable but could be improved with retry logic.

---

### Status

**✅ 16/16 tasks complete.** Ready for verification.

### Migration Note

The migration (`supabase/migrations/003_auth.sql`) MUST be run BEFORE deploying middleware, because existing RLS policies reference JWT `wallet_address` claims that email authentication doesn't provide. Without the migration, RLS would reject all email-authenticated requests.

# Proposal: Auth + Onboarding

## Intent

Platform has no authentication — users can't log in, register, or create their profile. The `participantes` table exists but is only reachable via `service_role` API routes. Without auth, we can't enforce RLS per-user, protect dashboard routes, or link blockchain actions to a real identity.

## Scope

### In Scope
- Supabase Auth (email/password) with `@supabase/ssr` for App Router
- `/login` and `/register` pages with loading/error/success states
- `/onboarding` page (protected): collects nombre, wallet_address, rol — creates `participantes` row
- AuthProvider wrapping root layout: exposes user, session, signOut, isLoading
- Middleware protecting `/(dashboard)` routes
- DB migration: add `user_id` to `participantes`, update RLS to use `auth.uid()`
- Basic wallet connect button (`window.ethereum`) with address display
- Update existing `client-browser.ts` to use SSR cookie-based client

### Out of Scope
- Social login / OAuth providers
- 2FA / MFA
- Password reset flow
- Wallet signature verification (EIP-4361 / SIWE)
- Role-based UI gating (prestatario)

## Capabilities

### New Capabilities
- `user-auth`: Supabase Auth integration — login, register, session management, middleware
- `onboarding`: Post-registration flow collecting participant profile data

### Modified Capabilities
- `participant-management`: RLS must change from `wallet_address` JWT claim to `auth.uid()`. Onboarding inserts into `participantes` — current spec assumes wallet-only auth.

## Approach

1. **Install** `@supabase/ssr`, create `auth-client.ts` (browser) and `auth-server.ts` (server)
2. **Migration**: add `user_id UUID REFERENCES auth.users(id)` to `participantes`; rewrite RLS policies to use `auth.uid()`; backfill for existing rows
3. **AuthProvider**: client component wrapping root layout via `layout.tsx`, exports `useAuth` hook
4. **Middleware**: `src/middleware.ts` reads session via `@supabase/ssr` server helpers, redirects to `/login` if unauthenticated on `/(dashboard)` routes
5. **Pages**: `/login` (email+password, link to register), `/register` (email+password+confirm, redirect to onboarding), `/onboarding` (form → upsert `participantes`, redirect to `/aprobacion`)
6. **Wallet**: `ConnectWallet` component using `window.ethereum`, stores address, pre-fills onboarding form

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/lib/supabase/client-browser.ts` | Modified | Replace `createClient` with `createBrowserClient` from `@supabase/ssr` |
| `src/lib/supabase/client.ts` | None | Stays service-role only |
| `src/lib/supabase/auth-client.ts` | New | Browser auth helpers (signUp, signIn, signOut) |
| `src/lib/supabase/auth-server.ts` | New | Server-side cookie session reader |
| `src/middleware.ts` | New | Route protection |
| `src/app/layout.tsx` | Modified | Add AuthProvider wrapper |
| `src/app/page.tsx` | Modified | Landing page with login/register CTA |
| `src/app/login/page.tsx` | New | Login form |
| `src/app/register/page.tsx` | New | Registration form |
| `src/app/onboarding/page.tsx` | New | Participant profile creation |
| `src/types/database.ts` | Modified | Add `user_id` to `ParticipanteRow` |
| `supabase/migrations/` | New | 003 migration for `user_id` + RLS update |
| `src/components/auth/AuthProvider.tsx` | New | Context provider |
| `src/components/auth/ConnectWallet.tsx` | New | Wallet connection button |
| `package.json` | Modified | Add `@supabase/ssr` dependency |
| `openspec/specs/participant-management/spec.md` | Modified | Update RLS requirement to use `auth.uid()` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Existing RLS on `participantes` uses `wallet_address` from JWT — will break on email auth | High | Migration adds `user_id` column + rewrites policies before deploy |
| `@supabase/ssr` cookie handling differs from `client-browser.ts` singleton pattern | Med | Keep singleton pattern, swap `createClient` → `createBrowserClient` |
| No existing auth.users — no way to test without real Supabase project | Med | Document setup steps in migration comments |

## Rollback Plan

1. Revert migration 003 (DROP user_id column, restore old RLS policies)
2. Restore `client-browser.ts` to original `createClient` from `@supabase/supabase-js`
3. Remove `src/middleware.ts`, remove AuthProvider from layout
4. Delete login, register, onboarding pages

## Dependencies

- `npm install @supabase/ssr`
- Supabase project must have `auth.users` available (email/password provider enabled)
- Migration 001 (`participantes` table) must already be applied

## Success Criteria

- [ ] Unauthenticated user accessing `/aprobacion` is redirected to `/login`
- [ ] User can register with email+password and is redirected to `/onboarding`
- [ ] User can complete onboarding (nombre, wallet, rol) → redirected to `/aprobacion`
- [ ] Revisiting `/onboarding` after completion redirects to `/aprobacion`
- [ ] Existing `client-browser.ts` consumers work without changes
- [ ] Wallet connect button detects MetaMask/Valora and displays address

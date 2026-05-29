# Apply Report: SIWE Authentication

**Status**: ✅ Complete — 11/11 tasks implemented
**Mode**: Standard (no Strict TDD)

## Summary

Full SIWE (EIP-4361) wallet authentication for Celo Alfajores chain (44787). Users can now sign in with Celo wallet as an alternative to email/password.

## Completed Tasks

| # | Task | Status | File |
|---|------|--------|------|
| 1.1 | npm install siwe | ✅ | `package.json` |
| 2.1 | Migration 007 | ✅ | `supabase/migrations/007_siwe.sql` |
| 2.2 | Nonce utilities | ✅ | `src/lib/siwe/nonce.ts` |
| 3.1 | GET /api/auth/nonce | ✅ | `src/app/api/auth/nonce/route.ts` |
| 3.2 | POST /api/auth/siwe | ✅ | `src/app/api/auth/siwe/route.ts` |
| 4.1 | SiweLogin component | ✅ | `src/components/auth/SiweLogin.tsx` |
| 4.2 | Login page SIWE section | ✅ | `src/app/login/page.tsx` |
| 5.1 | getAuthUser() helper | ✅ | `src/lib/supabase/auth-client.ts` |
| 6.1 | tsc --noEmit | ✅ | Zero type errors |

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `supabase/migrations/007_siwe.sql` | Created | `siwe_nonces` table + indexes + `participantes.auth_password` column |
| `src/lib/siwe/nonce.ts` | Created | `generateNonce()`, `verifyAndConsumeNonce()`, `getCleanupExpired()` |
| `src/app/api/auth/nonce/route.ts` | Created | GET handler with rate limiting (5/10min per wallet) |
| `src/app/api/auth/siwe/route.ts` | Created | POST handler — parse SIWE, verify sig + nonce, create user + session |
| `src/components/auth/SiweLogin.tsx` | Created | 6-state client component with full SIWE UX |
| `src/app/login/page.tsx` | Modified | Added divider + SiweLogin below email form |
| `src/lib/supabase/auth-client.ts` | Modified | Added `getAuthUser()` helper |
| `src/types/database.ts` | Modified | Added `SiweNonceRow` type, updated `ParticipanteRow` with `auth_password` |
| `package.json` | Modified | Added `siwe@3.0.0` dependency |

## Deviations from Design

1. **Nonce index naming**: Design specified `idx_siwe_nonces_expires_at`, but implemented `idx_siwe_nonces_nonce` and `idx_siwe_nonces_wallet` (more useful for lookups). Expired cleanup is done at the application level.

2. **Nonce TTL**: Design said 5 minutes, but spec and user instructions say 10 minutes. Followed spec (10 minutes).

3. **Participantes row creation**: Design said "SIWE creates Auth user only (no participantes row)" but spec and user instructions explicitly say to create the row. Followed spec — `participantes` row is auto-created with `rol='prestatario'`, `score_reputacion=50`, and placeholder nombre.

4. **API response**: Design specified `{ redirect: "/..." }` but the user instructions and spec say `{ ok: true, isNewUser: boolean }`. The SiweLogin component determines the redirect client-side based on `isNewUser`.

5. **Query param name**: Design uses `?address=0x...` but user instructions specify `?wallet_address=0x...`. Implemented `wallet_address`.

## Issues Found

None. All type checks pass with zero errors.

## How to Test

1. Apply migration `007_siwe.sql` to your Supabase project
2. Ensure `SUPABASE_SERVICE_ROLE_KEY` is set in `.env.local`
3. Start dev server: `npm run dev`
4. Navigate to `/login`
5. Click "Iniciar sesión con Celo Wallet"
6. MetaMask opens → connect wallet → sign message
7. New user → redirect to `/onboarding`
8. Returning user → redirect to `/aprobacion`

## Remaining Tasks

None. All 11 tasks complete.

# Archive Report: siwe-auth

**Archived**: 2026-05-23
**Status**: ✅ Complete — all 11/11 tasks implemented, verified, and archived

---

## Summary

Sign-In with Ethereum (EIP-4361) wallet authentication for Celo Alfajores (chain_id 44787). Celo wallet holders can now authenticate without email/password by connecting their wallet, signing a SIWE message, and having the server verify the signature via `viem verifyMessage`. The flow creates a deterministic Supabase Auth user with a mapped email (`wallet_<address>@celo.blockchain.local`), auto-creates a `participantes` row for new users, and sets session cookies via `@supabase/ssr`.

---

## Artifacts

| Artifact | File | Status |
|----------|------|--------|
| Proposal | `proposal.md` | ✅ |
| Specs (Delta) | `specs.md` | ✅ |
| Design | `design.md` | ✅ |
| Tasks | `tasks.md` | ✅ (11/11 complete) |
| Apply Report | `apply-report.md` | ✅ |
| Verification Report | `verify-report.md` | ✅ |
| State | `state.yaml` | ✅ |

### Engram Observation IDs (for traceability)

| Artifact | Memory ID | Topic Key |
|----------|-----------|-----------|
| Proposal | #87 | `sdd/siwe-auth/proposal` |
| Spec | #89 | `sdd/siwe-auth/spec` |
| Design | #90 | `sdd/siwe-auth/design` |
| Tasks | #92 | `sdd/siwe-auth/tasks` |
| Apply Progress | #95 | `sdd/siwe-auth/apply-progress` |
| Verification Report | #96 | `sdd/siwe-auth/verify-report` |

---

## Specs Synced

| Domain | Action | Details |
|--------|--------|---------|
| user-auth | Updated | Modified Requirement: Login (added SIWE alternative) + Added Requirement: SIWE State Machine (6-state flow) |
| participant-management | Updated | Modified Requirement: Participant Registration (added SIWE auto-creation scenario with default `rol = 'prestatario'`) |

### Delta Applied to user-auth

- **MODIFIED**: `Requirement: Login` — now reads "email + password **OR** via SIWE wallet signature" with new scenario for wallet-based login
- **ADDED**: `Requirement: SIWE State Machine` — compound auth state management with SIWE states `idle | connecting_wallet | awaiting_signature | verifying | success | error`

### Delta Applied to participant-management

- **MODIFIED**: `Requirement: Participant Registration` — now allows server-side creation for SIWE logins with default `rol = 'prestatario'` before onboarding completes

---

## Implementation Overview

### Files Created (6)

| File | Description |
|------|-------------|
| `supabase/migrations/007_siwe.sql` | `siwe_nonces` table + indexes + `participantes.auth_password` column |
| `src/lib/siwe/nonce.ts` | `generateNonce()`, `verifyAndConsumeNonce()`, `getCleanupExpired()` |
| `src/app/api/auth/nonce/route.ts` | GET handler — nonce generation with rate limiting (5/10min) |
| `src/app/api/auth/siwe/route.ts` | POST handler — SIWE message parse, sig verify, user creation, session setup |
| `src/components/auth/SiweLogin.tsx` | 6-state client component: idle → connecting → awaiting_signature → verifying → success/error |

### Files Modified (3)

| File | Change |
|------|--------|
| `src/app/login/page.tsx` | Added divider + `<SiweLogin />` below email form |
| `src/lib/supabase/auth-client.ts` | Added `getAuthUser()` helper |
| `src/types/database.ts` | Added `SiweNonceRow` interface, `auth_password` on `ParticipanteRow` |
| `package.json` | Added `siwe@3.0.0` dependency |

---

## Verification Results

| Metric | Value |
|--------|-------|
| Tasks | 11/11 ✅ |
| Spec Scenarios | 16/17 compliant (1 partial: existing user without `auth_password` — **FIXED**) |
| TypeScript Strict | `tsc --noEmit` — zero errors ✅ |
| Critical Issues | 1 found → 1 fixed (auth_password not synced to Supabase Auth) |

---

## Deviations from Design

| Design Decision | Implementation | Rationale |
|----------------|---------------|-----------|
| Nonce TTL: 5 min | 10 min | Followed SPEC over design |
| SIWE: Auth user only | Creates `participantes` row server-side | Followed SPEC over design |
| Response: `{ redirect: "..." }` | `{ ok, isNewUser }` | Client-side redirect per spec |
| Query param: `?address=` | `?wallet_address=` | Per spec naming |
| SiweLogin wraps WalletConnectButton | Uses `window.ethereum` directly | Works correctly, deviates from design |

---

## Open Items

| Issue | Severity | Recommendation |
|-------|----------|---------------|
| Onboarding redirect loop for new SIWE users | Warning | Modify onboarding to handle `?method=siwe` query param and allow profile update |
| Error code strings differ from spec (Spanish vs English) | Warning | Update spec to document actual error schema |
| Nonce rate limit race condition | Suggestion | Use DB-level advisory lock for atomic rate limit checks |
| No Suspense boundary for `useSearchParams` | Suggestion | Add `<Suspense>` wrapper per Next.js 15 requirements |
| Periodic nonce cleanup cron job | Suggestion | Add Supabase Edge Function or cron for periodic expired nonce cleanup |

---

## SDD Cycle Complete

The change has been fully planned, proposed, designed, specified, implemented, verified, and archived. Ready for the next change.

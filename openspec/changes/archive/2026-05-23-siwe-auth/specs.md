# Delta Specs: SIWE Authentication

## siwe-auth (New Capability — Full Spec)

### Purpose

Enable wallet-based authentication via EIP-4361 (Sign-In with Ethereum) on Celo Alfajores (chain_id 44787) as an alternative to email/password.

### Requirements

#### Requirement: Nonce Generation (Migration 007)

The system MUST generate, persist, and auto-expire SIWE nonces using a `siwe_nonces` table.

- GIVEN an unauthenticated user with a connected wallet
- WHEN they call `GET /api/auth/nonce?wallet_address=0x...`
- THEN a random 16-byte hex nonce is generated via `crypto.randomBytes`
- AND stored in `siwe_nonces` with `wallet_address` and `expires_at = NOW() + 10min`
- AND the response is `{ nonce: "0x...", expires_at: "ISO8601" }`

- GIVEN expired or consumed nonces
- WHEN a nonce read query runs
- THEN it SHALL delete all rows where `expires_at < NOW()` (application-level cleanup)

- GIVEN a request without `wallet_address`
- WHEN `GET /api/auth/nonce` is called
- THEN the API SHALL return 400 `{ error: "wallet_address is required" }`

#### Requirement: SIWE Verification (POST /api/auth/siwe)

The system MUST parse, validate, and verify a SIWE message+signed, then create or link a Supabase session.

- GIVEN a valid SIWE message and signature for a NEW wallet
- WHEN `POST /api/auth/siwe` receives `{ message, signature }`
- THEN the SIWE message is parsed (domain matches Origin, nonce exists and not expired, chain_id === 44787)
- AND the signature is verified via `viem verifyMessage`
- AND the nonce is deleted (single-use)
- AND a Supabase Auth user is created with a deterministic email (`wallet_<lower_address>@celo.blockchain.local`)
- AND a `participantes` row is inserted with `wallet_address`, `user_id`, `nombre = "Wallet " + truncated_address`
- AND a session cookie is set via `@supabase/ssr` server helpers
- AND the response is `{ ok: true, isNewUser: true }`

- GIVEN a valid SIWE message for an EXISTING wallet with a `participantes` row
- WHEN `POST /api/auth/siwe` is called
- THEN the existing user is looked up from `participantes.user_id`
- AND a session is created for that user
- AND the response is `{ ok: true, isNewUser: false }`

- GIVEN an invalid signature
- WHEN `POST /api/auth/siwe` is called
- THEN the API SHALL return 401 `{ error: "Invalid signature" }`

- GIVEN an expired or already-used nonce
- WHEN `POST /api/auth/siwe` is called
- THEN the API SHALL return 401 `{ error: "Nonce expired or already used" }`

- GIVEN a chain_id other than 44787 (Celo Alfajores)
- WHEN `POST /api/auth/siwe` is called
- THEN the API SHALL return 403 `{ error: "Unsupported chain — use Celo Alfajores" }`

#### Requirement: SIWE Login UI

The login page MUST render a wallet-based SIWE flow below the email form.

- GIVEN an unauthenticated user on `/login`
- WHEN the page renders
- THEN a visual separator "O inicia con tu wallet Celo" is shown below the email form
- AND a `WalletConnectButton` is rendered
- AND when the wallet connects, a "Firmar con wallet" button initiates signing
- AND the UI transitions: `idle` → `connecting_wallet` → `awaiting_signature` → `verifying` → `success` / `error`

- GIVEN a successful SIWE login for a NEW user
- WHEN the API responds `{ ok: true, isNewUser: true }`
- THEN the user is redirected to `/onboarding`

- GIVEN a successful SIWE login for an EXISTING user
- WHEN the API responds `{ ok: true, isNewUser: false }`
- THEN the user is redirected to `/aprobacion`

- GIVEN the user rejects the signature in their wallet
- WHEN the wallet throws error code 4001
- THEN the UI SHALL show "Firma rechazada" with a retry button
- AND no session is created

---

## Delta for user-auth

### MODIFIED Requirements

#### Requirement: Login

The system MUST authenticate users via email + password using Supabase Auth **OR** via SIWE wallet signature.
(Previously: email + password only)

- GIVEN an unauthenticated user
- WHEN they submit valid email + password on `/login`
- THEN a session cookie is set
- AND they are redirected to the original requested route or `/aprobacion`

- GIVEN a user submitting invalid credentials
- WHEN the form is submitted
- THEN an inline error message is displayed
- AND no session is created

- GIVEN a user with a connected wallet
- WHEN they complete the SIWE signing flow
- THEN a session is created via wallet authentication
- AND they are redirected according to `isNewUser` flag

### ADDED Requirements

#### Requirement: SIWE State Machine

The login page client component MUST manage compound auth state: the email form's `idle | loading | error` plus the SIWE flow's wallet states.

- GIVEN the login page rendering
- WHEN the user interacts with either auth method
- THEN each method operates independently
- AND the SIWE states SHALL be `idle | connecting_wallet | awaiting_signature | verifying | success | error`

---

## Delta for participant-management

### MODIFIED Requirements

#### Requirement: Participant Registration

The system MUST allow creation of participants with `wallet_address`, `nombre`, `rol`, and a non-nullable `user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE`. **For SIWE logins, the `participantes` row MAY be created server-side before the user completes onboarding, with a default rol of `'prestatario'`.**
(Previously: only created during onboarding form submission)

- GIVEN an authenticated user without a participantes row
- WHEN they submit valid data (nombre, wallet_address, rol)
- THEN a row is inserted with their user_id, score_reputacion = 50, activo = true
- AND user_id has a UNIQUE constraint preventing duplicate rows

- GIVEN a wallet address that connects via SIWE for the first time
- WHEN `POST /api/auth/siwe` succeeds
- THEN a participantes row is auto-created with `rol = 'prestatario'`, `score_reputacion = 50`, `activo = true`
- AND a placeholder `nombre` is set (formatted from wallet address)
- AND the user is redirected to `/onboarding` to complete their profile

#### Requirement: RLS Isolation

(Unchanged — retaining full block for archive safety.)

The system MUST enforce RLS on `participantes` via `auth.uid()` instead of JWT wallet_address claims. The INSERT policy MUST use `auth.uid()` for `user_id`, and SELECT/UPDATE policies MUST compare `user_id` against `auth.uid()`. Admin users (rol = 'admin') MAY bypass row-level filtering on SELECT to see all rows.

- GIVEN an authenticated user
- WHEN they SELECT from participantes
- THEN they only see rows WHERE user_id = auth.uid() (or their rol = 'admin')
- AND INSERT grants WITH CHECK (user_id = auth.uid())
- AND UPDATE uses USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())

---

## Summary

| Domain | Type | Reqs | Scenarios |
|--------|------|------|-----------|
| siwe-auth | New | 3 | 9 |
| user-auth | Modified + Added | 1 modified, 1 added | 4 |
| participant-management | Modified | 1 modified | 4 |

**Coverage**: Happy paths ✓ | Edge cases ✓ (expired nonce, wrong chain, rejected signature, replayed nonce) | Error states ✓ (invalid sig, expired nonce, missing param, wrong chain)

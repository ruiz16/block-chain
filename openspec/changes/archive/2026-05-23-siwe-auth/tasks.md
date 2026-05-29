# Tasks: SIWE Authentication (EIP-4361)

## Phase 1: Dependencies

- [x] 1.1 Run `npm install siwe` — add EIP-4361 parsing library to `package.json`

## Phase 2: Database + Nonce

- [x] 2.1 Create `supabase/migrations/007_siwe.sql` — `siwe_nonces` table (UUID PK, nonce TEXT UNIQUE, wallet_address TEXT, expires_at TIMESTAMPTZ, created_at TIMESTAMPTZ) + `CREATE INDEX idx_siwe_nonces_nonce`, `idx_siwe_nonces_wallet` + `ALTER TABLE participantes ADD COLUMN auth_password TEXT`
- [x] 2.2 Create `src/lib/siwe/nonce.ts` — `generateNonce()` (crypto.randomBytes → hex), `verifyAndConsumeNonce(nonce, walletAddress)` (SELECT + DELETE single-use), `getCleanupExpired()` (DELETE WHERE expires_at < NOW())

## Phase 3: API Routes

- [x] 3.1 Create `src/app/api/auth/nonce/route.ts` — GET handler: validate `?wallet_address=0x...`, rate limit (5/10min), call generateNonce, return `{ nonce, expires_at }`
- [x] 3.2 Create `src/app/api/auth/siwe/route.ts` — POST handler: parse SIWE message (siwe lib), validate domain+chain_id(44787)+nonce, verify signature via viem `verifyMessage`, create/find Supabase Auth user + participantes row, set session via `@supabase/ssr` `signInWithPassword`, return `{ ok, isNewUser }`

## Phase 4: UI

- [x] 4.1 Create `src/components/auth/SiweLogin.tsx` — 6-state component (idle → connecting → awaiting_signature → verifying → success → error): connects wallet, fetches nonce, creates SIWE message, calls `personal_sign`, POSTs to `/api/auth/siwe`, redirects on success
- [x] 4.2 Update `src/app/login/page.tsx` — add separator ("O inicia con tu wallet Celo") + <SiweLogin /> below the email form

## Phase 5: Integration

- [x] 5.1 Add `getAuthUser()` to `src/lib/supabase/auth-client.ts` — calls `getSession()` and returns `session.user` for client-side user checks after SIWE redirect

## Phase 6: Verify

- [x] 6.1 Run `npx tsc --noEmit` — fix any type errors before shipping (zero errors)

# Proposal: SIWE Authentication (Sign-In with Ethereum)

## Intent

Add EIP-4361 (Sign-In with Ethereum) as a second auth method alongside email/password. Celo wallet holders currently have no way to sign in without email/password — they must connect a wallet during onboarding but still authenticate via Supabase Auth. SIWE lets them sign in with just their wallet, reducing friction for wallet-native users.

## Scope

### In Scope
- `siwe` package + viem `verifyMessage` integration for server-side verification
- `GET /api/auth/nonce` (generate nonce) + `POST /api/auth/siwe` (verify + create session)
- SIWE button + connect→sign→redirect flow on `/login`
- Wallet linking for existing email-auth users (profile settings)
- Migration 007: `siwe_nonces` table + cleanup job

### Out of Scope
- SIWE-only registration (skip onboarding — wallet connects, but user MUST complete /onboarding once)
- Multi-wallet support (one wallet per user, one user per wallet)
- Session key / EIP-1271 (smart contract wallet) support
- Hardware wallet / WalletConnect protocol support (only `window.ethereum`)

## Capabilities

### New Capabilities
- `siwe-auth`: Nonce generation/lifecycle, SIWE message parsing, signature verification via viem, wallet-based Supabase session creation, and wallet→user mapping lookup

### Modified Capabilities
- `user-auth`: Login page gains a second auth method (SIWE); wallet linking adds a new "link wallet" flow for authenticated email users
- `participant-management`: `participantes` creation must handle the case where a wallet is already known before onboarding (SIWE login auto-creates user, redirects to onboarding)

## Approach

### Core Flow
1. User clicks "Sign in with Celo Wallet" → WalletConnectButton connects → requests nonce from `GET /api/auth/nonce`
2. Browser constructs SIWE message (domain, address, chain_id=44787, nonce, uri, issued_at) and calls `eth_personalSign` via wallet
3. `POST /api/auth/siwe` receives `{ message, signature }`:
   - Parses SIWE message via `siwe` package → validates domain, nonce, chain_id
   - Calls `getPublicClient().verifyMessage()` for EIP-191 signature verification
   - Checks nonce exists in `siwe_nonces` table and hasn't expired
   - Looks up `participantes` by `wallet_address`:
     - **Found + has `user_id`** → sign in directly (redirect to `/aprobacion`)
     - **Found + no `user_id`** → link to new Supabase Auth user (edge case)
     - **Not found** → create Supabase Auth user via admin API, create `participantes` row with `wallet_address`, redirect to `/onboarding`
4. Session created via `@supabase/ssr` server client + admin API token exchange

### Nonce Storage
- Supabase `siwe_nonces` table (Migration 007): `{ nonce TEXT PK, address TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL }`
- TTL: 5 minutes. Periodic cleanup of expired rows via DB function or application-level on read.

### Wallet Linking
- Authenticated email user on a profile page clicks "Link Wallet" → SIWE flow → `PATCH /api/participantes` updates `wallet_address`
- Ensures `wallet_address` is not already linked to another user (unique index enforces this)

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/app/api/auth/nonce/route.ts` | New | Nonce generation endpoint |
| `src/app/api/auth/siwe/route.ts` | New | SIWE verification + session creation |
| `src/app/login/page.tsx` | Modified | Add SIWE section below email form |
| `src/components/auth/SiweButton.tsx` | New | Wallet connect → sign → redirect component |
| `src/lib/supabase/auth-client.ts` | Modified | Add `signInWithWallet` function |
| `supabase/migrations/007_siwe_nonces.sql` | New | Nonce table + cleanup |
| `package.json` | Modified | Add `siwe` dependency |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Supabase Admin API token exchange | Medium | Fallback: store auto-generated password for wallet users and use `signInWithPassword` |
| Nonce replay across instances | Low | DB-backed nonces with TTL and single-use enforcement |
| Wallet connects wrong chain | Medium | Validate chain_id in SIWE message; reject if not Celo Alfajores (44787) |
| User rejects signature in wallet | Low | Catch error, show friendly message, allow retry |

## Rollback Plan

1. Revert migration 007: `DROP TABLE siwe_nonces;`
2. Remove `src/app/api/auth/` directory
3. Remove `SiweButton.tsx` from login page (revert to email-only)
4. Remove `siwe` from `package.json` → `npm install`
5. No DB data loss — SIWE-created users remain as Supabase Auth users, but will need password reset to log in again

## Dependencies

- `siwe` (npm) — EIP-4361 message creation/parsing (^2.x or ^3.x)
- `viem` — already installed (^2.50.4), provides `verifyMessage`
- `@supabase/ssr` — already installed (^0.10.3), for cookie-based session management

## Success Criteria

- [ ] Wallet user can complete full SIWE login: connect → sign → redirect to correct page
- [ ] Returning wallet user skips onboarding and goes straight to `/aprobacion`
- [ ] Email user can link wallet to existing account without creating a new session
- [ ] Invalid signature, expired nonce, or wrong chain all show clear error states
- [ ] All states (idle, connecting, signing, verifying, error, success) render correctly

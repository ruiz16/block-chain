# Design: SIWE Authentication (Sign-In with Ethereum)

## Technical Approach

Add EIP-4361 (SIWE) as a second auth method alongside email/password for Celo Alfajores wallet holders. The flow connects wallet → fetches nonce → creates SIWE message → user signs in wallet → server verifies signature + nonce → creates or finds Supabase Auth session → redirects based on profile completion status.

This is a server-rendered Next.js App Router implementation: API routes handle nonce generation and signature verification, the client component manages wallet interaction and UI states, and Supabase Auth handles session lifecycle via `@supabase/ssr` cookie management.

## Architecture Decisions

### Decision: Session Creation Strategy

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Supabase admin API token exchange | No direct "create session" endpoint in admin API | ❌ |
| Store auto-generated password + `signInWithPassword` | Password stored in DB, but pragmatically acceptable since service_role key is already exposed | ✅ |
| Deterministic password derivation | Reversible if algorithm known — security risk | ❌ |

**Chosen**: Store a `crypto.randomUUID()` password in a new `participantes.auth_password` column on first SIWE login. On subsequent logins, retrieve the password from DB and call `getServerClient(cookies).auth.signInWithPassword()` to set session cookies on the response.

### Decision: Nonce Backend

| Option | Tradeoff | Decision |
|--------|----------|----------|
| In-memory Map (Vercel Edge) | Lost on cold start — unreliable for serverless | ❌ |
| DB-backed with TTL | Survives cold starts, single-use via DELETE, cleanup via cron | ✅ |
| JWT nonce (stateless) | Cannot revoke/invalidate without a blacklist | ❌ |

**Chosen**: DB-backed nonces in `siwe_nonces` table. 5-minute TTL enforced at read time. Expired rows cleaned via application-level check + periodic DB function.

### Decision: Wallet→User Mapping

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `participantes.wallet_address` unique index | Already exists in schema (migration 001) | ✅ Reuse |
| Separate `wallet_auth` table | Extra JOIN on every login | ❌ |

**Chosen**: Reuse the existing unique `idx_participantes_wallet_address`. Look up `participantes` by `wallet_address` on SIWE login. If no row exists, create Auth user + redirect to `/onboarding` (existing flow handles profile creation).

### Decision: SIWE Onboarding Flow

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Create `participantes` row during SIWE, redirect to `/onboarding` | Current POST `/api/participantes` rejects existing rows (409) — requires modification | ❌ |
| Create Auth user only, redirect to `/onboarding` | Existing flow handles everything; wallet address captured in onboarding form | ✅ |

**Chosen**: SIWE login creates the Supabase Auth user + session only (no `participantes` row). Redirect to `/onboarding?method=siwe` where the existing form captures `wallet_address` via the embedded WalletConnectButton and creates the row via `POST /api/participantes`.

### Decision: WalletConnectButton Changes

| Option | Tradeoff | Decision |
|--------|----------|----------|
| SiweLogin wraps WalletConnectButton internally, reads address via callback | Cleaner encapsulation — no prop change needed | ✅ |
| Add `currentAddress` prop to WalletConnectButton | Exposes internal state — breaks existing contract | ❌ |

**Chosen**: `SiweLogin` renders `WalletConnectButton` and reads the address via its existing `onAddressChange` callback — no prop changes needed.

## Data Flow

### SIWE Login (New Wallet — No Profile)

```
User clicks "Sign in with Celo"
        │
        ▼
WalletConnectButton connects wallet
        │ address: 0x...
        ▼
GET /api/auth/nonce?address=0x...
        │ { nonce: "abc123..." }
        ▼
Client creates SIWE message (EIP-4361):
  domain, address, uri, nonce, chain_id=44787, version=1, issued_at
        │
        ▼
window.ethereum.request({ method: 'personal_sign', params: [message, address] })
        │ { signature }
        ▼
POST /api/auth/siwe { message, signature }
        │
        ├── Parse SIWE message (siwe package) ──→ validate domain, nonce, chain_id
        ├── getPublicClient().verifyMessage() ──→ verify EIP-191 sig
        ├── DELETE from siwe_nonces (single-use)
        ├── SELECT participantes WHERE wallet_address
        │     └── Not found → (a) Create Auth user with random password
        │                      (b) Store password in participantes.auth_password
        │                      (c) signInWithPassword → set session cookies
        │                      (d) Redirect to /onboarding?method=siwe
        │
        └── Response: 200 { redirect: "/onboarding?method=siwe" }

Onboarding page:
  ── WalletConnectButton reads wallet
  ── User fills nombre + selects rol
  ── POST /api/participantes { nombre, wallet_address, rol }
  ── Redirect to /aprobacion
```

### SIWE Login (Returning Wallet — Has Profile)

```
POST /api/auth/siwe { message, signature }
        │
        ├── Verify message + nonce (same as above)
        ├── SELECT participantes WHERE wallet_address
        │     └── Found + user_id IS NOT NULL
        │         → Retrieve auth_password from participantes
        │         → signInWithPassword(email, password)
        │         → Set session cookies
        │         → redirect to /aprobacion
        └── Response: 200 { redirect: "/aprobacion" }
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/app/api/auth/nonce/route.ts` | Create | `GET` — generates nonce, stores in `siwe_nonces`, returns `{ nonce }` |
| `src/app/api/auth/siwe/route.ts` | Create | `POST` — parses SIWE message, verifies sig + nonce, creates/finds session |
| `src/components/auth/SiweLogin.tsx` | Create | Full SIWE flow UI: connect → sign → verify → redirect, with all states |
| `src/lib/siwe/nonce.ts` | Create | `generateNonce()`, `storeNonce()`, `consumeNonce()`, `cleanupExpired()` helpers |
| `supabase/migrations/007_siwe_nonces.sql` | Create | `siwe_nonces` table + cleanup function + `participantes.auth_password` column |
| `src/app/login/page.tsx` | Modify | Add SIWE section below email form with `SiweLogin` component |
| `src/components/auth/WalletConnectButton.tsx` | Modify | No prop change — `SiweLogin` uses existing `onAddressChange` callback |
| `src/lib/supabase/auth-client.ts` | Modify | Add `getAuthUser()` helper for client-side session check after redirect |
| `src/app/onboarding/page.tsx` | Modify | Read `method=siwe` query param, show wallet-connected state |
| `package.json` | Modify | Add `siwe` dependency |

## Interfaces / Contracts

### API: GET /api/auth/nonce

```
Query:  ?address=0x...
200:    { nonce: "abc123..." }
429:    { error: "LIMITE_NONCES", detail: string }  // rate limit
```

### API: POST /api/auth/siwe

```
Body:   { message: string, signature: `0x${string}` }
200:    { redirect: "/onboarding?method=siwe" | "/aprobacion" }
400:    { error: "SIWE_INVALIDO", detail: string }     // bad message format
401:    { error: "FIRMA_INVALIDA", detail: string }    // sig doesn't match
409:    { error: "NONCE_EXPIRADO", detail: string }    // nonce used/expired
500:    { error: "ERROR_INTERNO", detail: string }     // auth creation failed
```

### Types (`src/types/database.ts`)

```typescript
export interface SiweNonceRow {
  id: string;
  nonce: string;
  wallet_address: string;
  expires_at: string;  // timestamptz
  created_at: string;
}
```

### Migration: `007_siwe_nonces.sql`

```sql
CREATE TABLE siwe_nonces (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nonce           TEXT UNIQUE NOT NULL,
  wallet_address  TEXT NOT NULL DEFAULT '',
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '5 minutes'),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for cleanup queries
CREATE INDEX idx_siwe_nonces_expires_at ON siwe_nonces (expires_at);

-- Password column for SIWE auto-generated passwords
ALTER TABLE participantes
  ADD COLUMN auth_password TEXT;
```

## Testing Strategy

No test infrastructure exists (strict TDD disabled). Testing will be manual via browser:

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `nonce.ts` — generation, expiration check | Manual `node -e` or isolated test file |
| Integration | `POST /api/auth/siwe` — valid sig, expired nonce, wrong chain | Manual curl/Postman against local dev |
| E2E | Full SIWE flow — MetaMask connect → sign → redirect | Manual browser test on `localhost:3000/login` |
| E2E | Returning user flow — existing wallet redirects to `/aprobacion` | Manual test with known wallet address |

## Migration / Rollout

1. Create `supabase/migrations/007_siwe_nonces.sql` and apply via Supabase dashboard or CLI
2. `npm install siwe` — add dependency
3. Implement in this order:
   - `src/lib/siwe/nonce.ts` + `route.ts` (nonce endpoint)
   - `src/app/api/auth/siwe/route.ts` (verification endpoint)
   - `SiweLogin.tsx` + `login/page.tsx` (UI)
   - Migration + type updates last
4. No feature flag needed — SIWE section appears below email form

## Open Questions

- [ ] How does the onboarding page read `method=siwe` query param and pre-fill wallet? Does the existing onboarding page exist? Need to check.
- [ ] Should we apply rate limiting to `GET /api/auth/nonce`? Proposal doesn't specify but a 5-nonces-per-address-per-10-minutes guard would prevent abuse.
- [ ] What happens if a user has both an email account and a wallet with the same address? The unique `wallet_address` index prevents this at DB level, but should the login page warn?

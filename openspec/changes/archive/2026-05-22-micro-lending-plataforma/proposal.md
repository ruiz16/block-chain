# Proposal: micro-lending-plataforma

## Intent

Build a community micro-lending platform on Celo Alfajores where participants grant/receive creditos (cUSD) backed by guarantors (avales). Full audit trail, reputation-based disbursement, and mobile-first UI — no intermediaries.

## Scope

### In Scope
- Supabase schema: `participantes`, `avales`, `creditos`, `audit_log` + RLS per role
- Feature-first Next.js App Router module structure
- `POST /api/desembolso` — reputation gate (score > 80), cUSD transfer via viem, tx_hash recording
- `PanelAprobacion.tsx` — pending credits list, Approve action, loading/error/empty states, CeloScan link
- Server-only private key management, strict TypeScript throughout
- Audit log for every financial action (create, approve, disburse, reject)

### Out of Scope
- KYC/identity verification (future)
- Interest calculation or repayment scheduling (future)
- Multi-chain support (Celo-only for v1)
- Admin dashboard or analytics (future)
- Email/SMS notifications

## Capabilities

### New Capabilities
- `participant-management`: Registration, roles (prestamista/prestatario/aval), reputation score CRUD
- `guarantor-system`: Aval relationships — create, verify, dissolve; cascade rules on score changes
- `credit-lifecycle`: Loan request → approval → disbursement → repayment workflow; status state machine
- `audit-trail`: Immutable append-only log for every mutation on financial entities
- `celo-integration`: Viem client setup, cUSD ERC-20 transfer, CeloScan URL builder
- `disbursement-api`: `POST /api/desembolso` — validate → transfer → record → audit
- `approval-ui`: `PanelAprobacion.tsx` — pending credits, approve/reject, loading/empty/error states

### Modified Capabilities
None (greenfield project).

## Approach

1. **Project structure**: `src/` feature-first — `features/participantes/`, `features/creditos/`, `features/avales/`, `features/audit/`, `lib/celo/`, `app/api/desembolso/`
2. **DB first**: Define Supabase schema with RLS before any API or UI code — migrations in `supabase/migrations/`
3. **Viem**: Static client factory via `createPublicClient` + `createWalletClient` — private key from `process.env.CELO_PRIVATE_KEY`
4. **cUSD token**: Use Celo Alfajores cUSD contract address — `0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1`
5. **UI**: Server component fetching pending credits, client `PanelAprobacion.tsx` for approve/reject actions using server actions or API call
6. **TypeScript**: Strict mode, branded types for `Wei`, `Address`, `TxHash`

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `supabase/migrations/` | New | Schema + RLS + indexes |
| `src/features/participantes/` | New | Types, queries, validation |
| `src/features/creditos/` | New | Lifecycle, status machine |
| `src/features/avales/` | New | Guarantor logic |
| `src/features/audit/` | New | Append-only log writer |
| `lib/celo/` | New | Viem client, cUSD transfer |
| `app/api/desembolso/route.ts` | New | Disbursement endpoint |
| `app/creditos/` | New | UI routes + PanelAprobacion |
| `src/types/` | New | Branded types, shared types |
| `package.json` | Modified | Add viem, @supabase/supabase-js |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Private key leak in env/vercel | Low | Server-only, never logged, limited to disbursement wallet |
| Celo Alfajores RPC flakiness | Medium | Retry with backoff, timeout, fallback RPC URL |
| cUSD transfer failure mid-tx | Low | Check tx receipt status before recording; audit on failure |
| RLS misconfiguration exposes data | Medium | Test RLS per role in integration tests; use Supabase local emulator |
| Reputation score race condition | Low | Use Supabase RPC/transactions for score reads+disbursement |

## Rollback Plan

1. **DB**: Run `supabase/migrations/<timestamp>_rollback.sql` to drop new tables
2. **API**: Remove `app/api/desembolso/` directory
3. **UI**: Remove `app/creditos/` route
4. **PK**: Revoke Celo wallet private key via Vercel env / server
5. **Package**: `npm uninstall viem @supabase/supabase-js` then `npm install` (restore lockfile)

## Dependencies

- Node.js 18+, npm
- Supabase project (local or cloud) with service role key
- Celo Alfajores RPC URL (default: `https://alfajores-forno.celo-testnet.org`)
- Deployer wallet with cUSD testnet funds via [Celo Alfajores Faucet](https://faucet.celo.org/alfajores)

## Success Criteria

- [ ] `supabase/migrations/` runs cleanly — all tables, RLS, indexes created
- [ ] `POST /api/desembolso` returns `201` with `tx_hash` for valid requests and `4xx` for invalid
- [ ] `PanelAprobacion.tsx` renders pending credits, approve flow completes with CeloScan link
- [ ] Every financial action has a corresponding `audit_log` row
- [ ] TypeScript strict mode compiles with zero errors
- [ ] RLS policy tests confirm isolation between roles

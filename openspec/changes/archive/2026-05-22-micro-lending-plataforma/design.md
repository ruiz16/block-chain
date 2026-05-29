# Design: Micro-Lending Platform on Celo Alfajores

## Technical Approach

Server-first disbursement flow: Next.js 15 Route Handler validates via Zod → checks reputation + credit state from Supabase (service role) → executes cUSD transfer via viem (server-only wallet) → records tx hash + audit log. UI is a thin client layer (`PanelAprobacion`) that polls pending credits and POSTs to the API. All blockchain interaction stays server-side — no wallet connection in the browser.

## Architecture Decisions

| Decision | Alternatives | Rationale |
|----------|-------------|-----------|
| **Feature-first modules** (`src/features/*`) | Flat `lib/` or page-based | Proposal mandates feature isolation; scales cleanly as capabilities grow (guarantors, repayments later) |
| **Viem singleton factory** (static `createPublicClient` + `createWalletClient`) | New client per request | Wallet client creation is idempotent; singleton avoids redundant RPC connections and keeps private key in one file |
| **Supabase service role in API** | RLS + anon key | API is backend-to-backend; service role bypasses RLS for reads/writes across tables in a single tx; anon key would need complex RLS policies for cross-table ops |
| **Reputation gating in API handler** | DB trigger or Postgres RPC | Placing the check in the handler makes the failure path explicit (returns 403); DB trigger would hide the logic and complicate audit logging |
| **Branded types** (`Wei`, `Address`, `TxHash`) | Plain `string` | Proposal requires strict TypeScript; branded types prevent passing a raw address where a tx hash is expected — catches errors at compile time |

## Data Flow — Disbursement Sequence

```
Cliente (Browser)          PanelAprobacion          POST /api/desembolso       lib/blockchain/         Supabase         Celo RPC
      │                         │                          │                        │                    │               │
      │── click "Aprobar" ──►   │                          │                        │                    │               │
      │                         │── fetch POST ──────────►  │                        │                    │               │
      │                         │                          │── Zod validate ──────►  │                    │               │
      │                         │                          │    ◄── ok/400 ────────  │                    │               │
      │                         │                          │── read credito ─────────────────────────────►  │               │
      │                         │                          │── read participante ──────────────────────────►  │               │
      │                         │                          │── check score > 80 ──►  │                    │               │
      │                         │                          │── check estado='aprobado'                      │               │
      │                         │                          │── simulateContract ──────────────────────────────────────────►│
      │                         │                          │    ◄── success ────────────────────────────────────────────────│
      │                         │                          │── writeContract ───────────────────────────────────────────────►│
      │                         │                          │── waitForTransactionReceipt ───────────────────────────────────►│
      │                         │                          │    ◄── receipt ────────────────────────────────────────────────│
      │                         │                          │── update credito (estado, tx_hash) ──────────►  │               │
      │                         │                          │── insert audit_log ───────────────────────────►  │               │
      │                         │    ◄── { tx_hash } ──────│                        │                    │               │
      │                         │── muestra CeloScanLink   │                        │                    │               │
      │  ◄── tx_hash link ──────│                          │                        │                    │               │
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/types/database.ts` | Create | Branded types (`Wei`, `Address`, `TxHash`), Supabase row types for participantes/creditos/avales/audit_log |
| `src/config/celo.ts` | Create | Network config: chain ID (44787), RPC URL, cUSD contract address, CeloScan base URL |
| `src/lib/blockchain/client.ts` | Create | Viem singleton: `createPublicClient` + `createWalletClient` (private key from `CELO_PRIVATE_KEY`) |
| `src/lib/blockchain/desembolsar.ts` | Create | `desembolsarCredito()`: approve → simulate → transfer cUSD → wait receipt → return `TxHash` |
| `src/lib/supabase/client.ts` | Create | Service-role Supabase client singleton from `SUPABASE_SERVICE_KEY` |
| `src/lib/validations/desembolso.ts` | Create | Zod schema for POST body: `creditoId: z.string().uuid()`, `aprobadoPor: z.string().uuid()` |
| `src/app/api/desembolso/route.ts` | Create | Route handler: validate → read state → check score → disburse → persist → audit → respond |
| `src/components/creditos/PanelAprobacion.tsx` | Create | Client component: idle/loading/success/error states, approve button, CeloScan link |
| `src/components/shared/CeloScanLink.tsx` | Create | Pure component: renders `<a>` to `https://alfajores.celoscan.io/tx/{txHash}` |
| `supabase/migrations/001_schema.sql` | Create | Tables + RLS + indexes + audit_log trigger |
| `package.json` | Modify | Add `viem`, `@supabase/supabase-js`, `zod` dependencies |

## Interfaces / Contracts

```typescript
// src/types/database.ts
type Brand<K, T> = K & { __brand: T };
type Wei = Brand<bigint, "Wei">;
type Address = Brand<`0x${string}`, "Address">;
type TxHash = Brand<`0x${string}`, "TxHash">;

// POST /api/desembolso
// Request:  { creditoId: string; aprobadoPor: string }
// 201:      { tx_hash: TxHash; estado: "desembolsado" }
// 400:      { error: string; details: ZodIssue[] }
// 403:      { error: "Reputation score below threshold" }
// 404:      { error: "Credito not found" | "Participante not found" }
// 409:      { error: "Credito not in aprobado state" }
// 500:      { error: "Blockchain transfer failed"; detail: string }

// PanelAprobacion props
interface PanelAprobacionProps {
  creditos: CreditoPendiente[];
}
interface CreditoPendiente {
  id: string;
  monto: number;      // cUSD decimal
  solicitante: string; // nombre
  score: number;       // reputation 0-100
  fecha: string;       // ISO date
}
```

## Component Design — PanelAprobacion States

```
idle:   [Lista de créditos pendientes] [Botón Aprobar] por fila
loading:[Spinner en el botón aprobado] (deshabilitado mientras tx corre)
success:[CeloScanLink con tx_hash] + mensaje "Desembolso exitoso"
error:  [Mensaje de error] + [Botón Reintentar]
```

## Security Architecture

| Layer | Mechanism | Enforced at |
|-------|-----------|-------------|
| Input | Zod schema — type + shape validation | Request handler |
| Auth | Supabase service role key (server env) | `lib/supabase/client.ts` |
| Key | `CELO_PRIVATE_KEY` — server-only, never logged | `lib/blockchain/client.ts` |
| Business | Reputation check (score > 80), estado check | Route handler |
| DB | FK constraints, CHECK (estado IN), UNIQUE | Migration SQL |

## Error Handling Strategy

| Condition | HTTP | Body |
|-----------|------|------|
| Zod validation failure | 400 | `{ error, details }` |
| Credito not found | 404 | `{ error: "Credito not found" }` |
| estado !== "aprobado" | 409 | `{ error: "Credito not in aprobado state" }` |
| score ≤ 80 | 403 | `{ error: "Reputation score below threshold" }` |
| viem simulate reverts | 500 | `{ error: "Contract simulation failed", detail }` |
| tx receipt status === "reverted" | 500 | `{ error: "Transaction reverted on chain" }` |
| Unexpected exception | 500 | `{ error: "Internal server error" }` |

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Zod schema — valid/invalid payloads, edge cases | Vitest + `safeParse` assertions |
| Unit | `desembolsarCredito()` — mock viem client, assert simulate + write + wait called | Vitest mocks |
| Unit | `CeloScanLink` — renders correct URL for tx hash | Vitest + @testing-library/react |
| Integration | `POST /api/desembolso` — mock Supabase + viem, test all error paths | Vitest + MSW or viem mock |
| Integration | Supabase migration — apply, insert rows, verify RLS | Local Supabase + psql |
| E2E | PanelAprobacion → approve → CeloScanLink visible | Playwright (future) |

## Migration / Rollout

No migration required. Deploy as new feature — run `supabase migration up`, deploy API routes, deploy UI. No backward-compatibility concerns in a greenfield project.

## Open Questions

- [ ] Single fallback RPC URL or a list with retry logic? (Proposal mentions "retry with backoff, timeout, fallback RPC URL")
- [ ] Should CeloScan link open in a new tab? (`target="_blank"` with `rel="noopener noreferrer"`)

# Tasks: Flujo de Repago

## Phase 1: Blockchain + Config

- [x] 1.1 Export `getPlatformWalletAddress()` from `src/lib/blockchain/client.ts` returning `getAccount().address` as `Address`
- [x] 1.2 Create `src/lib/blockchain/verificar-pago.ts` — read-only helper using `publicClient.getTransaction` + `getTransactionReceipt`; parse `Transfer` event logs (topic `0xddf252ad...`) to verify cUSD recipient === platform wallet and value >= expected; return `{ valid, reason? }` with 30s RPC timeout

## Phase 2: Validation + Migration

- [x] 2.1 Create `src/lib/validations/pago.ts` — Zod schema: `credito_id: z.string().uuid()`, `tx_hash: z.string().regex(/^0x[a-f0-9]{64}$/i)`, `.strict()`
- [x] 2.2 Create `supabase/migrations/004_pago.sql` — `ALTER TABLE creditos ADD COLUMN tx_hash_pago text, ADD COLUMN fecha_pago timestamptz`; unique partial index `idx_creditos_tx_hash_pago ON creditos (tx_hash_pago) WHERE tx_hash_pago IS NOT NULL`

## Phase 3: API Routes

- [x] 3.1 Create `src/app/api/pago/route.ts` — POST handler following desembolso pattern: Zod validate → fetch credito → check estado `desembolsado` (404/409) → check `tx_hash` uniqueness → call `verificarPago()` → `UPDATE creditos SET estado='pagado', tx_hash_pago, fecha_pago=NOW()` → return 200
- [x] 3.2 Create `src/app/api/mis-creditos/route.ts` — GET handler with Supabase Auth session (`getServerUser`); `SELECT creditos JOIN participantes WHERE user_id = auth.uid()`; return `{ creditos: CreditoRow[] }`; 401 if unauthenticated, 200 with `[]` if no rows

## Phase 4: UI Components

- [x] 4.1 Create `src/components/pagos/PanelPagos.tsx` — `"use client"` component with 6 states (loading, empty, no-pending, list, submitting, success, error); fetches from `GET /api/mis-creditos`; filters `desembolsado` credits; inline form per credit with tx_hash input; maps API error codes to user-facing messages in Spanish
- [x] 4.2 Create `src/app/(dashboard)/pagos/page.tsx` — server component wrapping `PanelPagos`
- [x] 4.3 Create `src/app/(dashboard)/mis-creditos/page.tsx` — server component with `MisCreditosClient` table rendering all user credits via `GET /api/mis-creditos`

## Phase 5: Types + Verify

- [x] 5.1 Update `src/types/database.ts` — add `fecha_pago` and `tx_hash_pago` to `CreditoRow`; add `PagoResponse`, `VerificationResult` types
- [x] 5.2 Run `npx tsc --noEmit` — fix any type errors

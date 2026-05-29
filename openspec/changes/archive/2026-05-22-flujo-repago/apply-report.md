# Apply Report: Flujo de Repago

## Implementation Progress

**Change**: flujo-repago
**Mode**: Standard

## Completed Tasks

### Phase 1: Blockchain + Config
- [x] 1.1 Export `getPlatformWalletAddress()` from `src/lib/blockchain/client.ts`
- [x] 1.2 Create `src/lib/blockchain/verificar-pago.ts` — event-log-based verification

### Phase 2: Validation + Migration
- [x] 2.1 Create `src/lib/validations/pago.ts` — Zod schema
- [x] 2.2 Create `supabase/migrations/004_pago.sql` — tx_hash_pago + fecha_pago columns

### Phase 3: API Routes
- [x] 3.1 Create `src/app/api/pago/route.ts` — POST handler
- [x] 3.2 Create `src/app/api/mis-creditos/route.ts` — GET handler

### Phase 4: UI Components
- [x] 4.1 Create `src/components/pagos/PanelPagos.tsx` — 7-state client component
- [x] 4.2 Create `src/app/(dashboard)/pagos/page.tsx` — server wrapper
- [x] 4.3 Create `src/app/(dashboard)/mis-creditos/page.tsx` + `MisCreditosClient`

### Phase 5: Types + Verify
- [x] 5.1 Update `src/types/database.ts` — added `fecha_pago`, `tx_hash_pago`, `PagoResponse`, `VerificationResult`
- [x] 5.2 Run `npx tsc --noEmit` — zero errors

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `src/lib/blockchain/client.ts` | Modified | Added `getPlatformWalletAddress()` export |
| `src/lib/blockchain/verificar-pago.ts` | Created | On-chain cUSD payment verification via Transfer event log parsing + 30s RPC timeout |
| `src/lib/validations/pago.ts` | Created | Zod schema: `credito_id` (UUID) + `tx_hash` (0x-hex regex) |
| `supabase/migrations/004_pago.sql` | Created | `tx_hash_pago text`, `fecha_pago timestamptz`, unique partial index |
| `src/app/api/pago/route.ts` | Created | POST handler: Zod → auth → fetch → verify → update → 200 |
| `src/app/api/mis-creditos/route.ts` | Created | GET handler: auth → participante lookup → creditos query → 200 |
| `src/components/pagos/PanelPagos.tsx` | Created | Client component: 7 states, inline tx_hash form, error mapping |
| `src/app/(dashboard)/pagos/page.tsx` | Created | Server wrapper for PanelPagos |
| `src/components/pagos/MisCreditosClient.tsx` | Created | Client component: read-only table of all user credits |
| `src/app/(dashboard)/mis-creditos/page.tsx` | Created | Server wrapper for MisCreditosClient |
| `src/types/database.ts` | Modified | Added `fecha_pago`, `tx_hash_pago` to `CreditoRow`; added `PagoResponse`, `VerificationResult` |

## Deviations from Design

None — implementation matches design.md.

### Clarifications
- **Migration includes `tx_hash_pago` column**: The design spec included both `tx_hash_pago` and `fecha_pago` columns. Implemented both with unique partial index per design.
- **PanelPagos uses 7 states (not 6)**: The spec distinguishes between "no credits at all" (`empty`) and "credits exist but none pending" (`no-pending`). These are separate visually meaningful states, so 7 states total.
- **MisCreditosClient**: Created as a separate client component file under `src/components/pagos/` for clarity, following the same pattern as PanelPagos.

## Issues Found

None.

## Remaining Tasks

None — all 11/11 tasks complete.

## Status

✅ **11/11 tasks complete. Ready for verification.**

## Implementation Details

### verificar-pago.ts — ERC-20 Event Log Verification
- Uses `publicClient.getTransaction` + `getTransactionReceipt` in parallel with a 30-second `Promise.race` timeout
- Verifies `tx.to` is the cUSD contract address (TX_DESTINO_INVALIDO)
- Verifies `receipt.status === 'success'` (TX_REVERTIDA)
- Finds `Transfer` event in receipt logs by matching `log.topics[0]` to `keccak256("Transfer(address,address,uint256)")` = `0xddf252ad...`
- Decodes event with `viem.decodeEventLog` to extract `to` and `value`
- Checks `to === platformWallet` (TX_BENEFICIARIO_INVALIDO) and `value >= montoEsperado` (TX_MONTO_INSUFICIENTE)

### POST /api/pago — Route Flow
1. Body parse + Zod validation (400 DATOS_INVALIDOS)
2. Session check via `getServerUser` (401 NO_AUTENTICADO)
3. Participante lookup by `user_id` (404 CREDITO_NO_ENCONTRADO)
4. Credit lookup by `id` + `prestatario_id` (404 CREDITO_NO_ENCONTRADO)
5. State validation: pagado → YA_PAGADO, other wrong states → ESTADO_INCORRECTO (409)
6. tx_hash_pago uniqueness check (409 TX_HASH_DUPLICADO)
7. On-chain verification via `verificarPago()` (422 with specific error code)
8. UPDATE `creditos SET estado='pagado', tx_hash_pago, fecha_pago=NOW()`
9. Rely on existing DB trigger for auto-audit (pago_recibido)
10. Return 200 `{ status: 'pagado', credito_id }`

### Auth Architecture
- Both API routes use `getServerUser` from `auth-server.ts` with `await cookies()` (Next.js 14+ async cookies)
- Service-role Supabase client used for all DB operations after auth check
- User identity resolved via `participantes.user_id = auth.uid()` join

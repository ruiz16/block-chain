# Proposal: Flujo de Repago

## Intent

Enable borrowers to register manual repayments via on-chain verification. Currently credits reach `desembolsado` and have no mechanism to transition to `pagado`. Borrowers need a dashboard to see active credits and a way to record their cUSD repayment transaction.

## Scope

### In Scope
- `POST /api/pago` — Register payment with on-chain tx verification
- `GET /api/mis-creditos` — List authenticated user's credits
- `PanelPagos.tsx` — Borrower UI: active credits list, payment form, CeloScan links
- `verificarPago()` — Transaction verification helper (viem)
- Migration 004 — Add `fecha_pago` column to `creditos`

### Out of Scope
- Auto-detection of payments (event listening / websocket)
- Partial payments, late fees, interest calculations
- Payment receipts or PDF generation
- Admin repayment overview panel

## Capabilities

### New Capabilities
- `payment-api`: `POST /api/pago` with on-chain validation, `GET /api/mis-creditos` for borrower's credit list
- `payment-ui`: Borrower-facing `PanelPagos.tsx` with credit list, payment form, loading/success/error states

### Modified Capabilities
- `celo-integration`: Add `verificarPago()` — getTransaction + getTransactionReceipt, validate destination address and amount
- `credit-lifecycle`: Add prerequisite rules for `desembolsado → pagado` transition (validated tx required)

## Approach

Extend the existing API pattern from `POST /api/desembolso`: create a new `/api/pago` route with isomorphic validation logic. `verificarPago()` wraps viem's `getTransaction` and `getTransactionReceipt` — confirm tx exists, `to` matches platform wallet, `value >= monto`. On success, update credit row (estado, tx_hash, fecha_pago) — the existing DB trigger already handles audit logging for `pagado → pago_recibido`. `GET /api/mis-creditos` joins `creditos → participantes` via `user_id = auth.uid()`. UI is a new client component under the existing dashboard pattern.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/app/api/pago/route.ts` | New | POST endpoint for payment registration |
| `src/app/api/mis-creditos/route.ts` | New | GET endpoint for borrower credit list |
| `src/lib/blockchain/verificarPago.ts` | New | On-chain tx verification helper |
| `src/lib/blockchain/client.ts` | Modified | May export publicClient for reuse |
| `src/components/PanelPagos.tsx` | New | Borrower payment dashboard |
| `supabase/migrations/004_pago.sql` | New | fecha_pago column on creditos |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Celo RPC timeout during payment verification | Medium | Wrap viem calls in timeout promise; clear user-facing error |
| User submits tx_hash for a different token (not cUSD) | Medium | Verify `to` === cUSD contract address in verification |
| Duplicate tx_hash submission | Low | tx_hash has UNIQUE constraint; return 409 |
| User pastes wrong tx_hash (valid but unrelated) | Low | Amount + destination check catches it |

## Rollback Plan

- **DB**: Drop migration 004 (`ALTER TABLE creditos DROP COLUMN fecha_pago`)
- **API**: Remove `src/app/api/pago/` and `src/app/api/mis-creditos/`
- **UI**: Remove `PanelPagos.tsx` and any imports
- **Blockchain**: Delete `verificarPago.ts`
- Existing `pago_recibido` in `tipo_accion` enum is shared — no cleanup needed

## Dependencies

- Celo Alfajores RPC endpoint (already configured via `CELO_RPC_URL`)
- Platform wallet `PRIVATE_KEY` (already configured)
- `participantes.user_id` must be populated for the borrower (migration 003)

## Success Criteria

- [ ] `POST /api/pago` accepts a valid tx_hash, verifies on-chain, transitions credit to `pagado`
- [ ] `POST /api/pago` rejects invalid/insufficient tx with clear error message
- [ ] `GET /api/mis-creditos` returns only the authenticated user's credits
- [ ] `PanelPagos.tsx` displays active credits, handles empty/loading/error states
- [ ] Migration 004 applies cleanly; `fecha_pago` is populated on payment

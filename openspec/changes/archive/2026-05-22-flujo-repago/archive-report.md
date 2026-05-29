# Archive Report: Flujo de Repago

**Change**: flujo-repago  
**Archived**: 2026-05-22  
**Archive path**: `openspec/changes/archive/2026-05-22-flujo-repago/`

---

## Summary

The Flujo de Repago change added manual cUSD repayment capability to the platform, enabling borrowers to register on-chain verified payments and transition credits from `desembolsado` to `pagado`. The change includes:

- **Migration 004**: Added `tx_hash_pago` and `fecha_pago` columns to `creditos`, with unique partial index on `tx_hash_pago`
- **POST /api/pago**: Register payment with on-chain tx verification — 11 error paths (400/401/404/409/422/500)
- **GET /api/mis-creditos**: List authenticated borrower's credits via `participantes` join
- **`verificarPago()`**: On-chain cUSD Transfer event log verification helper (30s RPC timeout, 6 error codes)
- **PanelPagos.tsx**: 7-state client component (loading/empty/no-pending/list/submitting/success/error)
- **MisCreditosClient.tsx**: Read-only table of all borrower credits

### Issues Resolved During Verify

- **CRITICAL — RPC timeout returned 422 (should be 500)**: `verificar-pago.ts` now distinguishes `RPC_ERROR` from `TX_NO_ENCONTRADA`; `route.ts` maps `RPC_ERROR` → 500. Spec scenario now matches implementation.

---

## Specs Synced

| Domain | Action | Details |
|--------|--------|---------|
| payment-api | Created | 11 requirements covering POST /api/pago and GET /api/mis-creditos |
| payment-ui | Created | 9 requirements covering PanelPagos and MisCreditosClient |
| credit-lifecycle | Updated | Added `desembolsado → pagado` to State Machine trigger; added Payment Transition and Payment Columns requirements |
| celo-integration | Updated | Added Payment Verification requirement with 7 scenarios including RPC_ERROR |

---

## Archive Contents

| Artifact | Present |
|----------|---------|
| proposal.md | ✅ |
| specs.md (delta specs) | ✅ |
| design.md | ✅ |
| tasks.md | ✅ (11/11 tasks complete) |
| apply-report.md | ✅ |
| verify-report.md | ✅ (PASS WITH WARNINGS — RPC timeout fix applied) |
| archive-report.md | ✅ (this file) |

---

## Implementation Files

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/blockchain/client.ts` | Modified | Added `getPlatformWalletAddress()` export |
| `src/lib/blockchain/verificar-pago.ts` | Created | cUSD Transfer event log verification + 30s RPC timeout + RPC_ERROR |
| `src/lib/validations/pago.ts` | Created | Zod schema: UUID + 0x-hex regex |
| `supabase/migrations/004_pago.sql` | Created | `tx_hash_pago text`, `fecha_pago timestamptz`, unique partial index |
| `src/app/api/pago/route.ts` | Created | POST handler: Zod → auth → fetch → verify (422/500) → update → 200 |
| `src/app/api/mis-creditos/route.ts` | Created | GET handler: auth → participante lookup → creditos query → 200 |
| `src/components/pagos/PanelPagos.tsx` | Created | 7-state client component, inline tx_hash form, error mapping |
| `src/components/pagos/MisCreditosClient.tsx` | Created | Read-only credits table |
| `src/app/(dashboard)/pagos/page.tsx` | Created | Server wrapper for PanelPagos |
| `src/app/(dashboard)/mis-creditos/page.tsx` | Created | Server wrapper for MisCreditosClient |
| `src/types/database.ts` | Modified | Added `fecha_pago`, `tx_hash_pago` to `CreditoRow`; added `PagoResponse`, `VerificationResult` |

---

## Known Issues

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | No automated tests for any of the 18 spec scenarios | ⚠️ WARNING | Unfixed — no test runner configured in project |
| 2 | Spec mentions `decodeFunctionData` but implementation uses `decodeEventLog` (design decision — event logs are more reliable for ERC-20) | ⚠️ WARNING | Spec outdated; design and implementation match |
| 3 | Migration 004 lacks `IF NOT EXISTS` guards | ⚠️ WARNING | Consistent with project-wide pattern but risky on re-run |
| 4 | `tx.from` verification not implemented (design open question) | 💡 SUGGESTION | Future improvement for sender verification |
| 5 | Minimum confirmations check not implemented (design open question) | 💡 SUGGESTION | Future improvement for chain reorg protection |

---

## Source of Truth Updated

The following main specs now reflect the new behavior:

- `openspec/specs/credit-lifecycle/spec.md` — Updated state machine, payment transition, payment columns
- `openspec/specs/celo-integration/spec.md` — Added payment verification with 7 scenarios
- `openspec/specs/payment-api/spec.md` — Created: POST /api/pago, GET /api/mis-creditos
- `openspec/specs/payment-ui/spec.md` — Created: PanelPagos, MisCreditosClient

---

## SDD Cycle Complete

The Flujo de Repago change has been fully planned, designed, specified, implemented, verified, and archived. Ready for the next change.

# Design: Flujo de Repago

## Technical Approach

Two API routes (`POST /api/pago`, `GET /api/mis-creditos`) + two dashboard pages + an on-chain verification helper. Extends the `desembolso` pattern: Zod validation → DB fetch → blockchain verification → DB update. The existing DB trigger auto-audits `pagado → pago_recibido` — no manual audit insert needed.

## Architecture Decisions

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `getTransaction` `to` check vs. event log parsing | For cUSD ERC-20 transfers, `tx.to` is the cUSD contract, not the platform wallet. Must parse `Transfer` event logs to find the actual recipient. | **Parse `Transfer` event logs** from receipt. `tx.to` check is incorrect for ERC-20. |
| Manual audit insert vs. DB trigger | Migration 001 trigger already inserts `pago_recibido` on `estado = 'pagado'`. Duplicate if we also call `registrarAuditLog`. | **Rely entirely on the DB trigger.** Route only UPDATEs the credit row. |
| Service-role Supabase client vs. server auth client for GET | `GET /api/mis-creditos` needs user-scoped filtering. Service-role + manual `user_id` filter is simpler than switching auth context. | **Service-role client** with explicit `participantes.user_id = auth.uid()` filter. |

## Data Flow

```
PanelPagos ──POST──→ /api/pago { credito_id, tx_hash }
  │
  ├─ Zod validate (400 if invalid)
  ├─ Fetch credito WHERE estado = 'desembolsado' (404/409)
  ├─ verificarPago(tx_hash, monto_wei, platformWallet)
  │   ├─ getTransaction          → tx exists? else → INVALID
  │   ├─ getTransactionReceipt   → status = 'success'? else → INVALID
  │   ├─ Find cUSD Transfer event in logs → to === platformWallet, value >= monto? else → INVALID
  │   └─ Return { valid: true }  or { valid: false, reason }
  │
  ├─ UPDATE creditos SET estado='pagado', tx_hash_pago, fecha_pago=NOW()
  │   └─ DB trigger → audit_log(pago_recibido)
  │
  └─ 200 { status: 'pagado', tx_hash }
```

```
ServerComponent ──→ /mis-creditos page
  ├─ getServerClient() → auth.uid()
  ├─ Supabase SELECT creditos JOIN participantes WHERE user_id = auth.uid()
  └─ Render MisCreditosClient table
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/app/api/pago/route.ts` | Create | POST — register payment with on-chain tx verification |
| `src/app/api/mis-creditos/route.ts` | Create | GET — authenticated user's credits via `auth.uid()` |
| `src/app/(dashboard)/pagos/page.tsx` | Create | Server component — fetch `desembolsado` credits |
| `src/app/(dashboard)/mis-creditos/page.tsx` | Create | Server component — all user credits |
| `src/components/pagos/PanelPagos.tsx` | Create | Client component — 6 loading/empty/list/submitting/success/error states |
| `src/lib/blockchain/verificar-pago.ts` | Create | cUSD event log verification helper (read-only) |
| `src/lib/validations/pago.ts` | Create | Zod schema: `credito_id` (UUID) + `tx_hash` (0x-hex) |
| `src/types/database.ts` | Modify | Add `CreditoActivo`, `PagoResponse`, `VerificationResult` types |
| `supabase/migrations/004_pago.sql` | Create | Add `tx_hash_pago`, `fecha_pago` to `creditos` |

## Key Implementation Details

### verificarPago — cUSD Event Log Parsing

For ERC-20 cUSD transfers, the transaction `to` is the cUSD contract, not the platform wallet. We parse the `Transfer` event from receipt logs instead:

```typescript
const TRANSFER_EVENT =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

const receipt = await publicClient.getTransactionReceipt({ hash: txHash });

const transferLog = receipt.logs.find((log) => {
  if (log.address.toLowerCase() !== cusdAddress.toLowerCase()) return false;
  if (log.topics[0] !== TRANSFER_EVENT) return false;
  const to = `0x${log.topics[2].slice(26)}` as `0x${string}`;
  return to.toLowerCase() === platformWallet.toLowerCase();
});

if (!transferLog) return { valid: false, reason: '...' };
// Parse value from log.data (uint256 hex)
```

This is a **read-only** operation via `publicClient` — no gas cost or wallet needed.

### GET /api/mis-creditos Auth

```typescript
const user = await getServerUser(cookies());
// → Supabase query: creditos JOIN participantes WHERE user_id = user.id
```

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit | `verificarPago` — valid/invalid txs, edge cases | Mock viem `getTransaction` + `getTransactionReceipt` |
| Integration | `POST /api/pago` — full flow, error states | Hit route with real/wrong/missing tx_hash |
| UI | `PanelPagos` — all 6 states render correctly | Renders with mock data, verify DOM |

## Migration 004

```sql
ALTER TABLE creditos ADD COLUMN tx_hash_pago text;
ALTER TABLE creditos ADD COLUMN fecha_pago timestamptz;
CREATE UNIQUE INDEX idx_creditos_tx_hash_pago ON creditos (tx_hash_pago)
  WHERE tx_hash_pago IS NOT NULL;
```

Rollback: `DROP INDEX idx_creditos_tx_hash_pago; ALTER TABLE creditos DROP COLUMN tx_hash_pago, DROP COLUMN fecha_pago;`

## Open Questions

- [ ] Should we verify `tx.from` matches the borrower's `wallet_address`? (Adds security, requires passing the borrower wallet to `verificarPago`)
- [ ] DB update fails after successful tx verification — retry or log? (Blockchain tx already happened, we just missed the DB write)
- [ ] Add minimum confirmations check (`blockNumber - receipt.blockNumber >= 6`)? Prevents chain reorg issues.

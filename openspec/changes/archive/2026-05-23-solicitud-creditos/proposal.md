# Proposal: Solicitud de Créditos + Loan Terms + Approval Flow

## Intent

Borrowers cannot submit credit requests through the platform — there's no form or API. Loan terms (interest, duration) are missing from the data model. The approval panel skips the formal `aprobado` state and goes directly to disbursement. We need to close this gap: borrower request → formal approval → disbursement.

## Scope

### In Scope
1. Migration 006: add `interes_porcentaje`, `plazo_dias` columns to `creditos`
2. `POST /api/creditos` — borrower submits credit request (estado=`pendiente`)
3. `PATCH /api/creditos/[id]/aprobar` — admin approves (estado→`aprobado`, calculates `fecha_vencimiento`)
4. `GET /api/creditos` — user lists their own credits (standardized `/api/mis-creditos`)
5. UI: `SolicitarCredito.tsx` form with plazo presets (30/60/90/180/365)
6. UI: `PanelAprobacion` two-step flow — "Aprobar" → `aprobado` state, then "Desembolsar"

### Out of Scope
- Payment schedule generation (installments)
- Late fee / default automation
- Credit scoring integration
- `monto_solicitado` column tracking (deferred; `monto` suffices for v1)

## Capabilities

### New Capabilities
- `credit-request`: Borrower credit request form (`SolicitarCredito.tsx`), `POST /api/creditos` creation, `GET /api/creditos` listing with loan terms display

### Modified Capabilities
- `credit-lifecycle`: Add loan terms (`interes_porcentaje`, `plazo_dias`) to data model; formalize the `pendiente→avalado→aprobado` transition chain with the new approval endpoint
- `approval-ui`: Split single "Aprobar→desembolso" button into two-step "Aprobar" (sets `aprobado` state) then "Desembolsar" (calls existing `POST /api/desembolso`)

## Approach

**Migration 006**: `ALTER TABLE creditos ADD COLUMN interes_porcentaje NUMERIC(5,2) DEFAULT 0`, `ADD COLUMN plazo_dias INTEGER`. DB trigger auto-audits the `pendiente→aprobado` transition as `credito_aprobado` (already handled by existing CASE ELSE in `audit_credito_estado_change()`).

**POST /api/creditos**: Zod schema (`monto: z.number().positive()`, `plazo_dias: z.number().int().min(30).max(365)`, `descripcion: z.string().optional()`). Uses session + participante lookup (same pattern as `/api/pago`). Inserts with `estado='pendiente'`. Returns 201 with created credito.

**PATCH /api/creditos/[id]/aprobar**: Protected by `requireAdmin()` (same pattern as admin/* routes). Validates current estado is `pendiente` or `avalado`. Sets `estado='aprobado'`, calculates `fecha_vencimiento = NOW() + plazo_dias INTERVAL`. Manual audit log insertion via `registrarAuditLog()` (belt-and-suspenders; DB trigger also fires).

**GET /api/creditos**: Same logic as existing `/api/mis-creditos`. Returns creditos with new loan term fields included.

**SolicitarCredito.tsx**: Client form with 4 states (idle, submitting, success, error). Preselected plazo dropdown (30/60/90/180/365 days). On success, link to `/mis-creditos`.

**PanelAprobacion update**: Render a per-row `estado` badge. If `pendiente`/`avalado` → show "Aprobar" button (calls PATCH). If `aprobado` → show "Desembolsar" button (calls existing POST). The `approving` state only affects the row being actioned (not the whole table).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `supabase/migrations/006_loan_terms.sql` | New | Add loan term columns |
| `src/app/api/creditos/route.ts` | New | POST (create) + GET (list) |
| `src/app/api/creditos/[id]/aprobar/route.ts` | New | PATCH approval endpoint |
| `src/lib/validations/creditos.ts` | New | Zod schemas |
| `src/components/creditos/SolicitarCredito.tsx` | New | Borrower form component |
| `src/components/creditos/PanelAprobacion.tsx` | Modified | Two-step flow |
| `src/app/(dashboard)/solicitar/page.tsx` | New | Route for solicitud form |
| `src/types/database.ts` | Modified | CreditoRow adds interes_porcentaje, plazo_dias |
| `openspec/specs/credit-lifecycle/spec.md` | Modified | Loan terms + approval endpoint |
| `openspec/specs/approval-ui/spec.md` | Modified | Two-step flow behavior |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Existing credits have NULL plazo_dias | High | Migration uses DEFAULT NULL; UI handles null gracefully |
| PanelAprobacion state complexity | Medium | Keep per-row actions; avoid global approving state |
| Audit trigger maps pendiente→aprobado as credito_aprobado | Low | Already correct — CASE ELSE handles it |

## Rollback Plan

1. **Migration rollback**: `ALTER TABLE creditos DROP COLUMN IF EXISTS interes_porcentaje, DROP COLUMN IF EXISTS plazo_dias, DROP COLUMN IF EXISTS fecha_vencimiento`
2. **API rollback**: Delete `src/app/api/creditos/` and move `mis-creditos/route.ts` back if `GET /api/creditos` replaced it
3. **UI rollback**: Revert `PanelAprobacion.tsx` to previous single-button version; remove `SolicitarCredito.tsx` and route
4. Revert `src/types/database.ts` and spec changes

## Dependencies

- Supabase migration 005 must have been applied (admin rol, audit_log RLS)
- `requireAdmin()` guard must exist (already in `src/lib/admin-guard.ts`)

## Success Criteria

- [ ] Migration 006 runs without errors; existing credits unaffected
- [ ] Borrower can submit a credit request via the solicitud form
- [ ] Admin can approve a credit (changes estado to `aprobado` with fecha_vencimiento)
- [ ] PanelAprobacion shows distinct "Aprobar" / "Desembolsar" buttons based on estado
- [ ] Desembolso still works after the state chain: pendiente→avalado→aprobado→desembolsado

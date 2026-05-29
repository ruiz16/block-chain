# Apply Report: Solicitud de Créditos + Approval Flow

**Date**: 2026-05-23
**Mode**: Standard
**Status**: 10/10 tasks complete — Ready for verify

---

## Completed Tasks

### Phase 1: Migration
- [x] **1.1** Created `supabase/migrations/006_loan_terms.sql`

### Phase 2: Types + Validations
- [x] **2.1** Updated `src/types/database.ts` — added `interes_porcentaje`, `plazo_dias`, `fecha_vencimiento` to `CreditoRow`; added `SolicitarCreditoInput` and `AprobarCreditoResponse` types
- [x] **2.2** Created `src/lib/validations/creditos.ts` — `SolicitarCreditoSchema` with zod validation for `monto`, `plazo_dias` (30–365), `descripcion` (≤500 chars, optional)

### Phase 3: API Routes
- [x] **3.1** Created `src/app/api/creditos/route.ts`:
  - `POST` — session check (401), participante lookup (404), Zod validate (400), INSERT with `estado='pendiente'`, `interes_porcentaje=10`, `plazo_dias` from body, audit log `credito_creado`, return 201
  - `GET` — session check (401), participante lookup (returns empty array if none), SELECT WHERE prestatario_id ORDER BY fecha_solicitud DESC, return 200
- [x] **3.2** Created `src/app/api/creditos/[id]/aprobar/route.ts`:
  - `PATCH` — requireAdmin guard (401/403), fetch credito (404), validate estado IN (`pendiente`,`avalado`) (409), UPDATE `estado='aprobado'` + `fecha_vencimiento` computed as now + plazo_dias, audit log `credito_aprobado`, return 200

### Phase 4: UI Components
- [x] **4.1** Created `src/components/creditos/SolicitarCredito.tsx` — 4-state client component (idle/submitting/success/error) with monto input, descripcion textarea, plazo_dias select (presets 30/60/90/180/365), POST to /api/creditos, redirect to /mis-creditos on success
- [x] **4.2** Created `src/app/(dashboard)/solicitar/page.tsx` — server page wrapping `<SolicitarCredito />` with metadata
- [x] **4.3** Updated `src/components/creditos/PanelAprobacion.tsx`:
  - Replaced `handleApprove` (always desembolso) with `handleAction(creditoId, estado)` that routes:
    - `pendiente`/`avalado` → `PATCH /api/creditos/{id}/aprobar` (keeps row in list, updates estado badge)
    - `aprobado` → `POST /api/desembolso` (removes row, shows success banner with CeloScanLink)
  - Replaced global `isApproving` with per-row `Record<string, boolean> isLoading` map
  - Replaced global error banner with per-row inline error messages
  - Extracted `PanelRow` sub-component for cleaner code organization
  - Added green badge color for `aprobado` estado display
- [x] **4.4** Updated `src/app/(dashboard)/aprobacion/page.tsx` — extended `.in('estado', ...)` filter from `['pendiente', 'avalado']` to `['pendiente', 'avalado', 'aprobado']`

### Phase 5: Verify
- [x] **5.1** `npx tsc --noEmit` — passes cleanly, zero type errors

---

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `supabase/migrations/006_loan_terms.sql` | Created | Migration adding `interes_porcentaje`, `plazo_dias`, `fecha_vencimiento` columns |
| `src/types/database.ts` | Modified | Added fields to `CreditoRow`, added `SolicitarCreditoInput`, `AprobarCreditoResponse` |
| `src/lib/validations/creditos.ts` | Created | Zod schema `SolicitarCreditoSchema` and `validateSolicitarCredito` wrapper |
| `src/app/api/creditos/route.ts` | Created | POST (create credit) + GET (list user's credits) |
| `src/app/api/creditos/[id]/aprobar/route.ts` | Created | PATCH (admin approve credit) |
| `src/components/creditos/SolicitarCredito.tsx` | Created | 4-state credit request form |
| `src/app/(dashboard)/solicitar/page.tsx` | Created | Server page wrapping SolicitarCredito |
| `src/components/creditos/PanelAprobacion.tsx` | Modified | Two-step flow (Aprobar → Desembolsar), per-row loading/error, PanelRow extraction |
| `src/app/(dashboard)/aprobacion/page.tsx` | Modified | Added 'aprobado' to estado filter |
| `openspec/changes/solicitud-creditos/tasks.md` | Modified | All 10 tasks marked [x] |

---

## Deviations from Design

None — implementation matches the design document and specs.

The only minor difference: `fecha_vencimiento` is computed in JavaScript (`Date.now() + plazo_dias * 24 * 60 * 60 * 1000`) rather than via PostgreSQL `NOW() + INTERVAL`, because the update is done client-side via Supabase JS client which doesn't support raw SQL expressions in `.update()`. The result is identical.

---

## Issues Found

None.

---

## Remaining Tasks

None — all 10 tasks complete. Ready for verify.

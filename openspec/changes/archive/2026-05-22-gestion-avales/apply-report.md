# Apply Report: Gestión de Avales

**Change**: gestion-avales  
**Mode**: Standard  
**Status**: 9/9 tasks complete

---

## Completed Tasks

### Phase 1: DB Migration
- ✅ **1.1** Created `supabase/migrations/002_avales.sql` — DO block adding `'aval_agregado'` and `'aval_revocado'` to `tipo_accion` enum with pg_enum idempotency check
- ✅ **1.2** Fixed trigger `audit_credito_estado_change` CASE — added `WHEN NEW.estado = 'avalado' THEN 'aval_agregado'::tipo_accion` AND `WHEN OLD.estado = 'avalado' AND NEW.estado = 'pendiente' THEN 'aval_revocado'::tipo_accion` before ELSE
- ✅ **1.3** Added `CREATE INDEX IF NOT EXISTS idx_avales_credito_id ON avales (credito_id)`

### Phase 2: Types + Validation
- ✅ **2.1** Updated `src/types/database.ts` — added `TipoAccion` union (8 values), updated `AuditLogRow.accion` to use `TipoAccion`, added `AsignarAvalInput` and `AvalConParticipante` interfaces, extended `CreditoPendiente` with `estado`, `prestatarioId`, `avalCount`
- ✅ **2.2** Created `src/lib/validations/avales.ts` — `AsignarAvalSchema`, `RevocarAvalParamsSchema`, `AvalQuerySchema` with `.strict()` and convenience `validate*` wrappers mirroring `desembolso.ts`

### Phase 3: API Routes
- ✅ **3.1** Created `src/app/api/avales/route.ts` — **POST** with full validation pipeline (Zod → credito exists + estado check → avalador exists + role check → self-assignment check → duplicate check → INSERT with default monto_maximo → UPDATE credito to avalado → audit log → 201). **GET** with credito_id/participante_id filter, joined participantes for name/wallet, returns enriched array.
- ✅ **3.2** Created `src/app/api/avales/[id]/revocar/route.ts` — **PATCH** with UUID param validation → fetch aval (active check) → fetch credito (not desembolsado/pagado/default) → SET activo=false → COUNT remaining → revert credito to pendiente if 0 → audit log → 200

### Phase 4: UI Component
- ✅ **4.1** Created `src/components/avales/GestorAvales.tsx` — 'use client' with 6 explicit states (loading, empty, list, assigning, revoking, error). Inline UUID input for assign, confirmation dialog before revoke ("¿Revocar aval de {nombre}?"), wallet truncation, locale-aware monto formatting. Matches PanelAprobacion style patterns.

### Phase 5: Integration
- ✅ **5.1** Updated `src/app/(dashboard)/aprobacion/page.tsx` — fetches aval counts per credit in batch, passes `estado`, `prestatarioId`, `avalCount` via `CreditoPendiente`. Modified `PanelAprobacion` to accept `renderAvalManager` render prop and `onAvalEstadoChange` callback. Shows "Estado" column with state chip + aval count badge. Expands GestorAvales inline per credit via [Avales] toggle button.

---

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `supabase/migrations/002_avales.sql` | Created | DO block for enum values, CREATE OR REPLACE trigger with fixed CASE, CREATE INDEX |
| `src/types/database.ts` | Modified | Added `TipoAccion` union, updated `AuditLogRow.accion`, added `AsignarAvalInput`, `AvalConParticipante`, extended `CreditoPendiente` |
| `src/lib/validations/avales.ts` | Created | 3 Zod schemas with strict mode + validate wrappers |
| `src/app/api/avales/route.ts` | Created | POST (assign) + GET (list) endpoints with full validation |
| `src/app/api/avales/[id]/revocar/route.ts` | Created | PATCH endpoint with idempotent revoke logic |
| `src/components/avales/GestorAvales.tsx` | Created | 6-state client component for aval management |
| `src/components/creditos/PanelAprobacion.tsx` | Modified | Added `renderAvalManager` render prop, `onAvalEstadoChange` callback, Estado column with badge, expandable aval section per row |
| `src/app/(dashboard)/aprobacion/page.tsx` | Modified | Batch aval count fetch, prestatario_id in query, GestorAvales via render prop |

---

## Deviations from Design

1. **`monto_maximo` omitted from AsignarAvalSchema** — Design doc included it in the Zod schema, but tasks/spec defined the input as `{ credito_id, avalador_id }`. The route handler defaults `monto_maximo` to the credit's `monto` value. This is more user-friendly (no extra field) and is the pattern implied by the spec scenarios.

2. **Trigger CASE extended for `aval_revocado`** — Design doc only mentioned adding `WHEN estado='avalado' THEN 'aval_agregado'`. Implementation also adds `WHEN OLD.estado='avalado' AND NEW.estado='pendiente' THEN 'aval_revocado'` to handle the revoke → pendiente transition correctly. Without this, the trigger would log 'credito_aprobado' for the state regression.

3. **Interface naming adjusted** — Design used `AvalResponse`, `RevocarResponse`, `AvalAsignadoResponse`. Implementation uses `AsignarAvalInput` and `AvalConParticipante` per task spec, and returns the API responses as inline types in route handlers (matching the desembolso pattern of not exporting response types).

4. **Integration via render prop, not direct import** — Design envisioned direct integration of GestorAvales in PanelAprobacion. Implementation uses a `renderAvalManager` prop to keep components decoupled (SRP).

---

## Issues Found

- **Zod v4 compatibility**: The project uses Zod ^4.4.3. The verify phase should confirm that `.strict()`, `.safeParse()`, and `z.infer` work identically in Zod v4 — the `validate*` wrappers use the same API surface.
- **Trigger idempotency**: The CREATE OR REPLACE FUNCTION is fully idempotent, but if the migration is re-run after the trigger has already been updated, the DO block correctly skips the ALTER TYPE (since the new enum values already exist), and the CREATE OR REPLACE overwrites the trigger with no change. Safe for re-runs.
- **No test coverage**: Tests for Zod schemas, API routes, and component states are out of scope for this apply batch (testing plan defined separately).

---

## Remaining Tasks

None — all 9 tasks are complete.

---

## Summary

| Metric | Value |
|--------|-------|
| Phases | 5 |
| Tasks | 9/9 ✅ |
| Files created | 5 |
| Files modified | 3 |
| Migrations | 1 (idempotent, 002_avales.sql) |
| API endpoints | 3 (POST, GET, PATCH) |
| DB enum values added | 2 (aval_agregado, aval_revocado) |
| Lines of code | ~750+ |

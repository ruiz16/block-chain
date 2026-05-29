# Archive Report: Gestión de Avales

**Change**: gestion-avales  
**Archived**: 2026-05-22  
**Archive path**: `openspec/changes/archive/2026-05-22-gestion-avales/`

---

## Summary

The Gestión de Avales change added full guarantor management to the credit lifecycle, including:

- **DB migration 002**: Extended `tipo_accion` enum with `aval_agregado`/`aval_revocado`, fixed trigger CASE mapping for `avalado` → `aval_agregado`, added index `idx_avales_credito_id`
- **Zod validation schemas** for avales API (assign, list, revoke)
- **POST /api/avales** — assign aval to credit, transition credit to `avalado`
- **GET /api/avales** — list avales filtered by `credito_id` or `participante_id`
- **PATCH /api/avales/[id]/revocar** — revoke aval, revert credit to `pendiente` if last aval
- **GestorAvales** — 6-state client component with assign/revoke flow
- **Integration** into PanelAprobacion via `renderAvalManager` render prop, Estado column with aval count badge

### Issues Resolved

- **5 TypeScript errors** from verify phase: 4x TS2367 (dead code in GestorAvales.tsx — removed duplicate assign form from narrowed `empty` branch) + 1x TS2339 (unused `onAvalEstadoChange` prop in PanelAprobacion.tsx — removed from destructuring). All confirmed fixed in final source.

---

## Specs Synced

| Domain | Action | Details |
|--------|--------|---------|
| avales-api | Created | 3 requirements (POST, GET, PATCH) with 7 scenarios |
| gestor-avales | Created | 1 requirement (Manage Guarantors) with 2 scenarios |
| credit-lifecycle | Updated | Modified State Machine (exclusive trigger for pendiente→avalado), modified Approval Prerequisites (reject with SIN_AVALES instead of auto-transition) |
| audit-trail | Updated | Added `aval_revocado` scenario to Mandatory Logging |
| approval-ui | Updated | Added Integrate GestorAvales requirement with scenario |
| guarantor-system | Updated | Removed Create Aval and Unique Constraint requirements (replaced by avales-api), kept Cascade on Score |

### Destructive Changes

- **guarantor-system**: 2 of 3 requirements removed (Create Aval, Unique Constraint). Functionality migrated to avales-api domain. Intentional per design — enforcement moved from direct participant action / DB constraint to API layer.

---

## Archive Contents

| Artifact | Present |
|----------|---------|
| proposal.md | ✅ |
| specs.md (delta specs) | ✅ |
| design.md | ✅ |
| tasks.md | ✅ (9/9 tasks complete) |
| apply-report.md | ✅ |
| verify-report.md | ✅ (PASS WITH WARNINGS — TS errors fixed) |
| archive-report.md | ✅ (this file) |

---

## Engram Artifact IDs

| Artifact | Engram ID |
|----------|-----------|
| proposal | #40 |
| spec | #41 |
| design | #42 |
| tasks | #43 |
| apply-progress | #45 |
| verify-report | #47 |
| archive-report | (current) |

---

## Implementation Files

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/002_avales.sql` | Created | Enum extension + trigger fix + index |
| `src/types/database.ts` | Modified | Added TipoAccion union, AsignarAvalInput, AvalConParticipante |
| `src/lib/validations/avales.ts` | Created | 3 Zod schemas with validate wrappers |
| `src/app/api/avales/route.ts` | Created | POST (assign) + GET (list) |
| `src/app/api/avales/[id]/revocar/route.ts` | Created | PATCH (revoke) |
| `src/components/avales/GestorAvales.tsx` | Created | 6-state client component |
| `src/components/creditos/PanelAprobacion.tsx` | Modified | Render prop + Estado column + aval section |
| `src/app/(dashboard)/aprobacion/page.tsx` | Modified | Aval count batch fetch + GestorAvales integration |

---

## SDD Cycle Complete

The Gestión de Avales change has been fully planned, implemented, verified, and archived. Ready for the next change.

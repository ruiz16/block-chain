# Apply Report: Panel Admin

## Phase 1: Migration — `supabase/migrations/005_admin.sql`

- **Created** `supabase/migrations/005_admin.sql`
- Adds `'admin'` to `rol_participante` enum via `DO $$` block with `pg_enum` existence check (ALTER TYPE ADD VALUE workaround for transactional safety)
- Drops existing `audit_log_select_authenticated` policy and creates `audit_log_select_admin_only` that restricts SELECT to admin users via `EXISTS (SELECT 1 FROM participantes WHERE user_id = auth.uid() AND rol = 'admin')`

## Phase 2: Types + Auth Guard

- **Modified** `src/types/database.ts` — added `'admin'` to `RolParticipante` union type
- **Created** `src/lib/admin-guard.ts` — `requireAdmin()` helper:
  - Calls `getServerUser(request.cookies)` for session verification
  - Queries `participantes` via service-role client for role check
  - Returns `Response` on 401/403, or `{ user, participante }` on success
  - Error shape: `{ error: 'UNAUTHORIZED' | 'FORBIDDEN', detail: string }`

## Phase 3: API Routes

All three routes call `requireAdmin()` as first operation:

- **`src/app/api/admin/metrics/route.ts`** — `GET` handler returning 7 KPIs:
  - `totalParticipantes`, `totalCreditos`, `totalDesembolsado`, `totalPagado`, `enCirculacion`, `defaultRate`, `scorePromedio`
  - All numeric aggregations use JS-side computation from flat fetch (consistent with design decision)

- **`src/app/api/admin/participantes/route.ts`** — `GET` handler with pagination:
  - Query params: `page` (default 1), `limit` (default 20, max 100)
  - Returns `{ data: ParticipanteAdmin[], total, page, limit }`
  - Enriches each participant with `totalCreditos` and `totalPrestado` from creditos table

- **`src/app/api/admin/audit-log/route.ts`** — `GET` handler with filtering + pagination:
  - Query params: `accion`, `fecha_desde`, `fecha_hasta`, `page`, `limit`
  - Returns `{ data: AuditLogAdmin[], total, page, limit }`
  - Joins participante names post-query via batch fetch (deduplicated IDs)

## Phase 4: UI Components

- **`src/components/admin/MetricCard.tsx`** — Pure display card with `label`, `value`, optional `icon`, optional `trend`. Styled with rounded border, shadow, tabular-nums for values.

- **`src/components/admin/MetricGrid.tsx`** — Responsive grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4`). Handles 0 items gracefully (returns null). Maps metrics array to MetricCard instances.

- **`src/components/admin/AuditLogTable.tsx`** — Styled table with columns: Fecha, Acción, Participante, Entidad, Detalles. Human-readable action labels via `actionLabel()` map. Truncated UUIDs and JSON preview. Empty state with icon and message.

## Phase 5: Dashboard Page

- **`src/app/(dashboard)/admin/dashboard/page.tsx`** — Client component:
  - **States**: `loading` (skeleton), `loaded` (normal), `error` (section-level)
  - Fetches `GET /api/admin/metrics` and `GET /api/admin/audit-log?limit=20` in parallel via `Promise.allSettled`
  - Per-section error handling: if metrics fails, shows error card but still renders audit table (and vice versa)
  - 4 display KPIs: Total Participantes, Desembolsado (cUSD), En Circulación (cUSD), Tasa de Default
  - Quick links navigation to `/admin/participantes` and `/admin/creditos`

## Phase 6: Middleware

- **Modified** `src/middleware.ts`:
  - After auth check passes, checks if path starts with `/admin` or `/api/admin`
  - Queries `participantes` via existing SSR client (respects RLS — auth.uid() = user_id)
  - If user exists but rol !== 'admin', redirects to `/login?redirect=<path>`
  - This is a UX improvement; real security is in `requireAdmin()` API guard

## Phase 7: Verification

- `npx tsc --noEmit` passed with zero errors

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `supabase/migrations/005_admin.sql` | Created | Admin role migration + audit_log RLS rewrite |
| `src/types/database.ts` | Modified | Added `'admin'` to `RolParticipante` union |
| `src/lib/admin-guard.ts` | Created | `requireAdmin()` auth guard helper |
| `src/app/api/admin/metrics/route.ts` | Created | GET — aggregate admin metrics |
| `src/app/api/admin/participantes/route.ts` | Created | GET — paginated participants with credit stats |
| `src/app/api/admin/audit-log/route.ts` | Created | GET — paginated filterable audit log |
| `src/components/admin/MetricCard.tsx` | Created | KPI display card component |
| `src/components/admin/MetricGrid.tsx` | Created | Responsive KPI grid component |
| `src/components/admin/AuditLogTable.tsx` | Created | Audit log table component |
| `src/app/(dashboard)/admin/dashboard/page.tsx` | Created | Admin dashboard page |
| `src/middleware.ts` | Modified | Added admin role redirect for `/admin/*` routes |
| `openspec/changes/panel-admin/tasks.md` | Modified | Marked all 10 tasks complete |

## Deviations from Design

None — implementation matches design. Key decisions followed:
1. **Dashboard as client component** (Design Decision over spec's server-component mention) — API-as-boundary pattern
2. **Both middleware + API guard** — defense in depth
3. **Metrics client-side from flat fetch** — aggregate in JS from creditos table
4. **Dashboard at `/admin/dashboard/page.tsx`** — matches spec scenarios, not spec requirement's `/admin/page.tsx`

## Status

**10/10 tasks complete. Ready for verify.**

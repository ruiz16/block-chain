# Tasks: Panel Admin

> **Dependencies**: specs.md, design.md, proposal.md
>
> **Cross-reference key**: Spec requirement IDs map to task IDs below.

---

## Phase 1: Migration

- [x] Task 1.1 — `supabase/migrations/005_admin.sql`

**Spec req**: Migration 005 — Admin Role (admin-api)
**Design ref**: File Changes — `supabase/migrations/005_admin.sql`

**What**:
- `ALTER TYPE rol_participante ADD VALUE 'admin'` using a `DO $$ ... END $$` block with `pg_enum` existence check (ALTER TYPE ADD VALUE does NOT support `IF NOT EXISTS` natively)
- **Must run outside a transaction block** — ALTER TYPE ADD VALUE cannot be executed inside a transaction with other operations

**audit_log RLS rewrite**:
- Drop existing policy `audit_log_select_authenticated` (from migration 001 — allows SELECT for all authenticated users)
- Create new policy `audit_log_select_admin_only`:
  ```sql
  CREATE POLICY "audit_log_select_admin_only"
    ON audit_log FOR SELECT
    TO authenticated
    USING (EXISTS (
      SELECT 1 FROM participantes
      WHERE user_id = auth.uid() AND rol = 'admin'
    ));
  ```

**Why**: The current RLS gives all authenticated users full read access to audit_log — admin-only access is required.

**Scenarios covered**: Enum extended, Audit RLS blocks non-admin, Audit RLS allows admin

---

## Phase 2: Types + Auth Guard

- [x] Task 2.1 — Update `src/types/database.ts`

**Spec req**: (Implied by admin-api — 'admin' must be valid in type system)
**Design ref**: File Changes — `src/types/database.ts`

**What**:
- Add `'admin'` to the `RolParticipante` union type:
  ```typescript
  export type RolParticipante = 'prestamista' | 'prestatario' | 'aval' | 'admin';
  ```

- [x] Task 2.2 — Create `src/lib/admin-guard.ts`

**Spec req**: Admin Auth Guard (admin-api)
**Design ref**: File Changes — `src/lib/admin-guard.ts`, Interfaces / Contracts — `requireAdmin()`

**What**:
- Export `requireAdmin(request: NextRequest)` with the following flow:
  1. Call `getServerUser(request.cookies)` from `@/lib/supabase/auth-server` — returns **401** `{ error: "NO_AUTH" }` Response if no session
  2. Call `getSupabaseClient()` from `@/lib/supabase/client` (service-role) and query:
     ```typescript
     .from('participantes').select('id, rol').eq('user_id', user.id).single()
     ```
  3. If no participante row or `rol !== 'admin'` → return **403** `{ error: "FORBIDDEN" }` Response
  4. On success → return `{ user, participante: { id, rol } }`
- Error response shape matches existing `ErrorResponse` pattern:
  ```typescript
  { error: 'UNAUTHORIZED' | 'FORBIDDEN', detail: string }
  ```

**Why defense-in-depth**: The API layer is the security boundary. Middleware handles UX redirects; requireAdmin ensures data stays protected even if middleware is bypassed.

---

## Phase 3: API Routes

- [x] Task 3.1 — Create `src/app/api/admin/metrics/route.ts`

**Spec req**: GET /api/admin/metrics (admin-api)
**Design ref**: File Changes — `src/app/api/admin/metrics/route.ts`, Supabase Queries — Metrics

**What**:
- `GET` handler
- First call `requireAdmin(request)` — return its Response on failure
- Fetch all rows from `creditos` (service-role client):
  ```typescript
  const { data: creditos } = await supabase.from('creditos').select('monto, estado');
  ```
- Aggregate in JS:
  | Field | Type | Computation |
  |-------|------|-------------|
  | `totalParticipantes` | number | `COUNT(*) FROM participantes` |
  | `totalCreditos` | number | `creditos.length` |
  | `totalDesembolsado` | string (cUSD) | `SUM(monto)` where `estado = 'desembolsado'` |
  | `totalPagado` | string (cUSD) | `SUM(monto)` where `estado = 'pagado'` |
  | `enCirculacion` | string (cUSD) | `SUM(monto)` where `estado IN ('pendiente','avalado','aprobado','desembolsado')` |
  | `defaultRate` | number | `(defaults / totalCreditos) * 100` (COALESCE to 0) |
  | `scorePromedio` | number | `AVG(score_reputacion) FROM participantes` |
- Return `NextResponse.json(metrics)` with status 200
- All numeric aggregations use COALESCE/fallback to 0 for empty DB

**Scenarios covered**: Happy path, Empty DB, Unauthorized

- [x] Task 3.2 — Create `src/app/api/admin/participantes/route.ts`

**Spec req**: GET /api/admin/participantes (admin-api)
**Design ref**: File Changes — `src/app/api/admin/participantes/route.ts`

**What**:
- `GET` handler with `requireAdmin(request)` as first call
- **Query params**: `page` (default 1), `limit` (default 20, max 100)
- Use **service-role** client for all DB access (consistent with existing patterns)
- Two queries:
  1. **Paginated participantes**: `SELECT * FROM participantes ORDER BY created_at DESC` with `.range(from, to)` + `{ count: 'exact' }`
  2. **Credit stats** per participant: fetch `creditos` grouped by `prestatario_id`:
     ```typescript
     supabase.from('creditos')
       .select('prestatario_id, monto')
       .in('prestatario_id', participanteIds)
     ```
     Then compute `totalCreditos` (COUNT) and `totalPrestado` (SUM monto) for each
- **Response shape**:
  ```typescript
  { data: ParticipanteAdmin[], total: number, page: number, limit: number }
  ```
  Where `ParticipanteAdmin` extends `ParticipanteRow` with `totalCreditos` and `totalPrestado`

**Scenarios covered**: Happy path, Overflow page, Unauthorized

- [x] Task 3.3 — Create `src/app/api/admin/audit-log/route.ts`

**Spec req**: GET /api/admin/audit-log (admin-api)
**Design ref**: File Changes — `src/app/api/admin/audit-log/route.ts`

**What**:
- `GET` handler with `requireAdmin(request)` as first call
- **Query params**:
  | Param | Type | Default | Notes |
  |-------|------|---------|-------|
  | `accion` | `tipo_accion` | none (all) | Filter by action type |
  | `fecha_desde` | ISO date string | none | Inclusive lower bound on `fecha` |
  | `fecha_hasta` | ISO date string | none | Inclusive upper bound on `fecha` |
  | `page` | number | 1 | |
  | `limit` | number | 20 | Max 100 |
- Use **service-role** client:
  ```typescript
  supabase.from('audit_log')
    .select('*', { count: 'exact' })
    .order('fecha', { ascending: false })
    .range(from, to)
  ```
  Apply `.eq('accion', accion)` if `accion` param present
  Apply `.gte('fecha', fecha_desde)` / `.lte('fecha', fecha_hasta)` if date params present
- Join `participantes.nombre` for display — either in-query (if Supabase supports) or post-query mapping via `participante_id`
- **Response shape**:
  ```typescript
  { data: AuditLogAdmin[], total: number, page: number, limit: number }
  ```
  Where `AuditLogAdmin` extends `AuditLogRow` with `participante_nombre: string | null`

**Scenarios covered**: Happy path, Filter by action, Filter by date range, No matches, Unauthorized

---

## Phase 4: UI Components

- [x] Task 4.1 — Create `src/components/admin/MetricCard.tsx`

**Design ref**: File Changes — `src/components/admin/MetricCard.tsx`

**What**:
- Server component (pure display — no hooks)
- **Props**:
  ```typescript
  interface MetricCardProps {
    label: string;       // e.g. "Total Participantes"
    value: string | number;  // formatted value
    icon?: React.ReactNode;  // optional icon
    trend?: { direction: 'up' | 'down'; value: string };  // optional delta
  }
  ```
- Renders a styled card with:
  - Icon area (top-left)
  - Label (small, muted text)
  - Value (large, bold)
  - Optional trend indicator (green up / red down with delta text)
- Follow existing `<div className="rounded-md bg-white border...">` patterns from the aprobacion page aesthetic

- [x] Task 4.2 — Create `src/components/admin/MetricGrid.tsx`

**Design ref**: File Changes — `src/components/admin/MetricGrid.tsx`

**What**:
- Server component
- **Props**:
  ```typescript
  interface MetricGridProps {
    metrics: Array<{ label: string; value: string | number }>;
  }
  ```
- Renders a responsive 4-column grid (`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4`)
- Maps `metrics` array to `<MetricCard>` instances
- Handles 1–4 items gracefully (if fewer than 4, center or left-align)

- [x] Task 4.3 — Create `src/components/admin/AuditLogTable.tsx`

**Design ref**: File Changes — `src/components/admin/AuditLogTable.tsx`

**What**:
- Server component
- **Props**:
  ```typescript
  interface AuditLogTableProps {
    entries: AuditLogAdmin[];
  }
  ```
- Renders a table with columns:
  | Column | Data | Format |
  |--------|------|--------|
  | Fecha | `fecha` | `new Date(fecha).toLocaleString('es-CO')` |
  | Acción | `accion` | Human-readable label (e.g. `desembolso` → `Desembolso`) |
  | Participante | `participante_nombre` | Plain text or `—` if null |
  | Entidad | `entidad_tipo` / `entidad_id` | `${entidad_tipo}: ${entidad_id.slice(0, 8)}...` |
  | Detalles | `detalles` | Truncated JSON preview |
- Follow existing table patterns (Tailwind-styled `<table>` with striped rows)
- Empty state: "No se encontraron entradas en el registro de auditoría"

---

## Phase 5: Dashboard Page

- [x] Task 5.1 — Create `src/app/(dashboard)/admin/dashboard/page.tsx`

**Spec req**: Dashboard Page (admin-dashboard)
**Design ref**: File Changes — `src/app/(dashboard)/admin/page.tsx` (note: design says `/admin/page.tsx`, spec scenarios say `/admin/dashboard` — using sub-path for cleaner URL structure)

**What**:
- **Client component** (`'use client'`) — consistent with API-as-boundary pattern (design decision overrides spec's server-component mention)
- On mount (`useEffect` / `useCallback`):
  1. Fetch `GET /api/admin/metrics` — extract 4 display KPIs:
     - `totalParticipantes` → "Total Participantes"
     - `totalDesembolsado` → "Desembolsado (cUSD)"
     - `enCirculacion` → "En Circulación (cUSD)"
     - `defaultRate` → "Tasa de Default"
  2. Fetch `GET /api/admin/audit-log?limit=20` — for last 20 entries
  3. Handle errors per-section (not blanket crash) — show error message in place of failed section
- **Loading state**: Show skeleton/spinner while fetching
- **Error state per section**: If metrics fetch fails, show error card but still render audit section (and vice versa)
- **Layout**:
  ```
  ├── <MetricGrid metrics={displayMetrics} />
  ├── <section> Últimos movimientos
  │   └── <AuditLogTable entries={auditEntries} />
  └── <nav> Accesos rápidos
      ├── <Link href="/admin/participantes">Gestión de Participantes</Link>
      └── <Link href="/admin/creditos">Gestión de Créditos</Link>
  ```
- **Quick links** section at bottom with styled `<Link>` components navigating to `/admin/participantes` and `/admin/creditos`

**Scenarios covered**: Page loads (KPIs + audit table + quick links), API error (section-level), Non-admin blocked (via API guard), Unauthenticated (via middleware)

---

## Phase 6: Middleware (user-auth Delta)

- [x] Task 6.1 — Modify `src/middleware.ts`

**Spec req**: Route Protection — user-auth Delta
**Design ref**: File Changes — `src/middleware.ts`

**What**:
- The current middleware already:
  - Matches `['/(dashboard)/:path*']` (covers `/(dashboard)/admin/*`)
  - Redirects unauthenticated users to `/login?redirect=<path>`
- **Modifications needed**:
  1. After auth check passes, check if the path is an admin route (`/admin/*` or `/api/admin/*`)
  2. Query `participantes` via the existing Supabase SSR client to check `rol = 'admin'` (NO service-role in middleware — use the same auth client)
  3. If user is authenticated but `rol !== 'admin'`, redirect to `/login` or show a 403 page
- **Important**: This is a UX improvement, NOT a security boundary. The real security is in `requireAdmin()`. Middleware redirect prevents non-admin users from seeing a broken page.

**Why both layers**: Design Decision — middleware for UX (redirect non-admin users before they see an error state), API guard for security (defense in depth).

---

## Phase 7: Verify

- [x] Task 7.1 — `npx tsc --noEmit`

**What**: Run the TypeScript compiler to catch type errors across all changed files.

**Pre-flight checklist**:
- ✅ All imports resolve (no missing module errors)
- ✅ Types match between API routes and client components
- ✅ `requireAdmin()` return type matches usage in route handlers
- ✅ `RolParticipante` union includes `'admin'` everywhere it's used
- ✅ No `any` or implicit `any` in new files

---

## Task Dependency Graph

```
Phase 1 (Migration)
    │
    ▼
Phase 2 (Types + Guard) ──► Phase 6 (Middleware)
    │                              │
    ▼                              │
Phase 3 (API Routes) ◄────────────┘
    │
    ▼
Phase 4 (UI Components)
    │
    ▼
Phase 5 (Dashboard Page)
    │
    ▼
Phase 7 (Verify)
```

Phases 2 and 6 can run in parallel after Phase 1. Phase 3 depends on Phase 2 (requireAdmin). Phase 4 is independent of Phases 2/3 (pure display components). Phase 5 depends on Phases 3 and 4.

## Cross-Reference: Spec → Task

| Spec Requirement | Task(s) |
|-----------------|---------|
| Migration 005 — Admin Role | 1.1 |
| Admin Auth Guard | 2.2 |
| GET /api/admin/metrics | 3.1 |
| GET /api/admin/participantes | 3.2 |
| GET /api/admin/audit-log | 3.3 |
| Dashboard Page | 4.1, 4.2, 4.3, 5.1 |
| Route Protection (user-auth Delta) | 6.1 |

## Notes & Known Discrepancies

1. **Dashboard page path**: Spec requirement says `/(dashboard)/admin/page.tsx` (renders at `/admin`), spec scenarios say `/admin/dashboard`. Using `/admin/dashboard/page.tsx` to match scenarios. URL = `/admin/dashboard`.

2. **Server vs Client component**: Spec says "server component following aprobacion/page.tsx pattern"; Design Decision says "client component — fetch on mount via API boundary". Following the **Design Decision** (API-as-boundary pattern). The `requireAdmin()` auth check happens inside each API route, not on the page itself.

3. **Middleware admin check**: Design File Changes says "Add admin role check in middleware", but the Decision says middleware is for UX, API for security. Adding a lightweight check in middleware (query `participantes.rol` with SSR client) to redirect non-admin users before they hit an error state. The `requireAdmin()` guard in each API route remains the real security boundary.

4. **Migration transactional safety**: ALTER TYPE ADD VALUE must run outside a transaction block. The `DO $$` block wraps only the ADD VALUE statement. If other migration operations (DROP/CREATE policy) need a transaction, they should be separate. **Best practice**: run the ALTER TYPE in its own execution, then run the RLS changes. In practice, Supabase runs each migration file as a single transaction — ALTER TYPE ADD VALUE inside a DO block is the workaround.

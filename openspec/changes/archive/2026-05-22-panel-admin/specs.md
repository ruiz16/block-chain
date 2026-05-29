# Panel Admin — Specification

---

## admin-api (New)

### Purpose

Protected read-only API endpoints under `/api/admin/*` exposing aggregate metrics, participant data with credit stats, and a filterable audit log — exclusively for users with `rol = 'admin'`.

### Requirements

#### Requirement: Migration 005 — Admin Role

Migration `005_admin.sql` MUST:

- Execute `ALTER TYPE rol_participante ADD VALUE 'admin'` **outside** a transaction block (ALTER TYPE ADD VALUE does not support running inside one with other operations)
- Replace the existing `audit_log_select_authenticated` policy with one that checks `EXISTS (SELECT 1 FROM participantes WHERE user_id = auth.uid() AND rol = 'admin')`
- No new columns or tables

| # | Scenario | Given | When | Then |
|---|----------|-------|------|------|
| 1 | Enum extended | Schema has `rol_participante` without `'admin'` | Migration runs | `'admin'` is a valid enum value |
| 2 | Audit RLS blocks non-admin | Auth user with `rol ≠ 'admin'` | SELECT on `audit_log` | Empty set |
| 3 | Audit RLS allows admin | Auth user with `rol = 'admin'` | SELECT on `audit_log` | All matching rows |

#### Requirement: Admin Auth Guard

A `requireAdmin()` helper that SHALL:

1. Call `supabase.auth.getUser()` to resolve the session
2. Query `participantes` WHERE `user_id = user.id` to get the participante row
3. Return **401** `{ error: "NO_AUTH" }` if no session
4. Return **403** `{ error: "FORBIDDEN" }` if no participante row or `rol ≠ 'admin'`
5. Return the participante row on success

All `/api/admin/*` route handlers MUST call `requireAdmin()` as the first operation.

#### Requirement: GET /api/admin/metrics

Returns aggregate KPIs computed via Supabase aggregate queries.

| Field | Type | Source |
|-------|------|--------|
| `totalParticipantes` | number | `COUNT(*) FROM participantes` |
| `totalCreditos` | number | `COUNT(*) FROM creditos` |
| `totalDesembolsado` | string | `SUM(monto) WHERE estado = 'desembolsado'` |
| `totalPagado` | string | `SUM(monto) WHERE estado = 'pagado'` |
| `enCirculacion` | string | `SUM(monto) WHERE estado IN ('pendiente','avalado','aprobado','desembolsado')` |
| `defaultRate` | number | `(COUNT WHERE estado='default' / totalCreditos) * 100` |
| `scorePromedio` | number | `AVG(score_reputacion) FROM participantes` |

| # | Scenario | Given | When | Then |
|---|----------|-------|------|------|
| 1 | Happy path | Admin auth | `GET /api/admin/metrics` | 200 with all 7 KPIs |
| 2 | Empty DB | No rows | `GET /api/admin/metrics` | 200 with zeros (COALESCE) |
| 3 | Unauthorized | Non-admin | `GET /api/admin/metrics` | 403 |

#### Requirement: GET /api/admin/participantes

Paginated list of every participante with their credit statistics.

**Query params**: `page` (default 1), `limit` (default 20, max 100)

**Response**: `{ data: ParticipanteAdmin[], total, page, limit }`

`ParticipanteAdmin`: `{ id, nombre, wallet_address, rol, score_reputacion, activo, totalCreditos, totalPrestado }`

`totalCreditos` = `COUNT(*) FROM creditos WHERE prestatario_id = participante.id`  
`totalPrestado` = `SUM(monto) FROM creditos WHERE prestatario_id = participante.id`

| # | Scenario | Given | When | Then |
|---|----------|-------|------|------|
| 1 | Happy path | Admin auth | `GET /api/admin/participantes?page=1&limit=10` | 200 with 10 items + pagination |
| 2 | Overflow page | Page > total pages | `GET /api/admin/participantes?page=999` | 200 with `data: []` |
| 3 | Unauthorized | Non-admin | `GET /api/admin/participantes` | 403 |

#### Requirement: GET /api/admin/audit-log

Paginated, filterable audit log entries joined with `participantes.nombre`.

**Query params**: `accion` (tipo_accion), `fecha_desde`, `fecha_hasta` (ISO dates), `page`, `limit`

**Response**: `{ data: AuditLogAdmin[], total, page, limit }`

`AuditLogAdmin`: `{ id, accion, entidad_tipo, entidad_id, participante_nombre, detalles, fecha }`

| # | Scenario | Given | When | Then |
|---|----------|-------|------|------|
| 1 | Happy path | Admin auth | `GET /api/admin/audit-log?page=1&limit=20` | 200 with paginated entries |
| 2 | Filter by action | Mixed actions exist | `GET /api/admin/audit-log?accion=desembolso` | Only desembolso entries |
| 3 | Filter by date | Entries across months | `GET /api/admin/audit-log?fecha_desde=2026-01-01&fecha_hasta=2026-06-01` | Entries in range |
| 4 | No matches | Filter matches nothing | `GET /api/admin/audit-log?accion=inexistente` | 200 with `data: []` |
| 5 | Unauthorized | Non-admin | `GET /api/admin/audit-log` | 403 |

---

## admin-dashboard (New)

### Purpose

Protected admin dashboard page at `/(dashboard)/admin/page.tsx` with KPI cards, recent audit log table, and quick-action navigation links.

### Requirements

#### Requirement: Dashboard Page

The page MUST:

- Be a **server component** (following the `aprobacion/page.tsx` pattern)
- Call `requireAdmin()` server-side — redirect to `/login` if no session, show 403 page if not admin
- Fetch metrics and audit log data in parallel server-side (not client-side)

**Metric cards** — 4 KPIs in a responsive grid:

| Card | Label | Source field |
|------|-------|-------------|
| Total Participantes | `Total Participantes` | `totalParticipantes` |
| Total Desembolsado | `Desembolsado (cUSD)` | `totalDesembolsado` |
| En Circulación | `En Circulación (cUSD)` | `enCirculacion` |
| Tasa de Default | `Tasa de Default` | `defaultRate` |

**Audit log table** — Last 20 entries. Columns: Fecha, Acción, Participante, Entidad. Data from GET /api/admin/audit-log?limit=20.

**Quick links** — Navigation to `/admin/participantes` and `/admin/creditos`.

| # | Scenario | Given | When | Then |
|---|----------|-------|------|------|
| 1 | Page loads | Admin user | Navigate to `/admin/dashboard` | 4 KPI cards visible, audit table with 20 rows, quick links rendered |
| 2 | API error | Metrics fetch fails | Page renders | Error state per section (not blanket crash) |
| 3 | Non-admin blocked | Auth user, rol ≠ admin | Navigate to `/admin/dashboard` | 403 Forbidden page |
| 4 | Unauthenticated | No session | Navigate to `/admin/dashboard` | Redirect to `/login?redirect=/admin/dashboard` |

---

## user-auth (Delta)

### MODIFIED: Route Protection

The middleware MUST redirect unauthenticated requests targeting `/(dashboard)/*` to `/login`, preserving the original URL as a redirect parameter.

(Previously: no admin role awareness — all authenticated users passed through all dashboard routes)

- GIVEN an unauthenticated user
- WHEN they request any `/(dashboard)/*` route
- THEN they are redirected to `/login?redirect=<original_path>`
- AND after login, returned to the original path

- GIVEN an authenticated user with `rol = 'admin'`
- WHEN they request `/admin/dashboard` or any `/api/admin/*` route
- THEN the request passes through and is processed normally

- GIVEN an authenticated user with `rol ≠ 'admin'`
- WHEN they request `/admin/dashboard` or any `/api/admin/*` route
- THEN the `requireAdmin()` guard returns 403 `{ error: "FORBIDDEN" }`
- AND the request is rejected before any data is fetched

- GIVEN an authenticated user with any rol
- WHEN they request a non-admin dashboard route (e.g. `/aprobacion`)
- THEN the middleware passes through without additional checks

---

## Scenarios

```
Scenario: Admin ve métricas
GIVEN un usuario con rol = 'admin'
WHEN accede a GET /api/admin/metrics
THEN recibe 200 con los 7 KPIs agregados

Scenario: No-admin bloqueado en API
GIVEN un usuario con rol = 'prestatario'
WHEN accede a GET /api/admin/metrics
THEN recibe 403 Forbidden

Scenario: Admin lista participantes
GIVEN un usuario con rol = 'admin'
WHEN accede a GET /api/admin/participantes?page=1&limit=20
THEN recibe 200 con lista paginada y stats de créditos

Scenario: Audit log filtrado por acción
GIVEN un usuario con rol = 'admin'
WHEN accede a GET /api/admin/audit-log?accion=desembolso
THEN recibe solo entradas con accion = 'desembolso'

Scenario: Dashboard carga KPIs y audit
GIVEN un admin autenticado
WHEN navega a /admin/dashboard
THEN ve 4 tarjetas de KPI y tabla con últimos 20 audit entries

Scenario: No-admin bloqueado en dashboard
GIVEN un usuario autenticado con rol = 'prestamista'
WHEN navega a /admin/dashboard
THEN recibe 403 Forbidden

Scenario: Usuario no autenticado redirigido
GIVEN no hay sesión activa
WHEN navega a /admin/dashboard
THEN redirigido a /login?redirect=/admin/dashboard
```

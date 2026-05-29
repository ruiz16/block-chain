# Design: Panel Admin

## Technical Approach

Three guarded API endpoints under `/api/admin/*` return KPIs, participant stats, and paginated audit logs. A client-side dashboard page at `/(dashboard)/admin/` fetches from them on mount. Auth enforcement happens at TWO levels: middleware redirects non-admin users away from `/admin`, and a `requireAdmin()` helper guards every API route (defense in depth).

## Architecture Decisions

### Decision: Auth enforcement — middleware + API guard

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Middleware only | Blocks page load but API could be hit directly | Rejected — API must be independently guarded |
| API guard only | Non-admin sees empty page with error states | Rejected — redirect improves UX |
| **Both layers** | Redundant but defense-in-depth; middleware for UX, API for security | **Adopted** |

### Decision: `requireAdmin()` uses service-role client for role query

| Option | Tradeoff | Decision |
|--------|----------|----------|
| SSR client with RLS | RLS policy `auth.uid() = user_id` works, but future queries need service-role anyway | Rejected — inconsistent with existing patterns |
| **Service-role client** | Bypasses RLS; matches every other API route in the codebase | **Adopted** — consistency over purity |

The helper verifies JWT via `getServerUser(request.cookies)` then checks `participantes.rol` with the service-role client.

### Decision: Metrics computed client-side from flat fetch

Fetch all `creditos` rows and aggregate in JS. For a micro-credit platform this is fine (<10k rows). If perf degrades, migrate to a Supabase SQL function or materialized view later.

### Decision: Dashboard is a client component

Server components can't call the admin API (they'd need to import `requireAdmin` directly, coupling page to auth logic). A client component that fetches on mount stays consistent with the API-as-boundary pattern.

## Data Flow

```
Browser                  API Route                     Supabase
  │                         │                             │
  ├─ GET /admin ──────────► │ (middleware checks auth)
  │                         │
  ├─ fetch /api/admin/metrics ──► requireAdmin(req) ──► participantes (rol check)
  │                         │                             │
  │                         ├─ SELECT creditos ──────────►│
  │                         │◄──── rows ──────────────────┤
  │                         ├─ aggregate in JS ───────────┤
  │◄──── { metrics } ──────┤                             │
  │                         │                             │
  ├─ fetch /api/admin/participantes ──► requireAdmin(req) │
  │                         ├─ SELECT participantes ─────►│
  │◄──── { participantes } ─┤                             │
  │                         │                             │
  ├─ fetch /api/admin/audit-log?page=1 ──► requireAdmin() │
  │                         ├─ SELECT audit_log ─────────►│
  │                         │   range(0, 19)              │
  │◄──── { items, total } ──┤                             │
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/lib/admin-guard.ts` | Create | `requireAdmin(request)` — returns `Response` on 401/403 or `{ user, participante }` |
| `src/app/api/admin/metrics/route.ts` | Create | `GET` — aggregate KPIs from `creditos` table |
| `src/app/api/admin/participantes/route.ts` | Create | `GET` — all participants with credit counts |
| `src/app/api/admin/audit-log/route.ts` | Create | `GET` — paginated audit log, query params `?page=&per_page=` |
| `src/app/(dashboard)/admin/page.tsx` | Create | Client component — fetch all 3 APIs, render MetricGrid + AuditLogTable |
| `src/components/admin/MetricCard.tsx` | Create | Single KPI card: icon, label, value, optional delta |
| `src/components/admin/MetricGrid.tsx` | Create | 4-column grid wrapping MetricCard components |
| `src/components/admin/AuditLogTable.tsx` | Create | Table with date/action/user/detail columns, pagination |
| `src/middleware.ts` | Modify | Add admin role check for `/(dashboard)/admin/:path*` after existing auth check |
| `src/types/database.ts` | Modify | Add `'admin'` to `RolParticipante` union type |
| `supabase/migrations/005_admin.sql` | Create | `ALTER TYPE rol_participante ADD VALUE 'admin'` |

## Interfaces / Contracts

### requireAdmin()

```typescript
export async function requireAdmin(
  request: NextRequest,
): Promise<{ user: User; participante: Pick<ParticipanteRow, 'id' | 'rol'> } | Response> {
  // 1. getServerUser(request.cookies) — 401 if null
  // 2. getSupabaseClient().from('participantes').select('id, rol').eq('user_id', user.id).single()
  // 3. participante.rol !== 'admin' — 403
  // 4. Return { user, participante }
}
```

### API Response Shapes

```typescript
// GET /api/admin/metrics → 200
interface AdminMetrics {
  total_prestado: number;     // SUM of monto (desembolsado/pagado/default)
  en_circulacion: number;     // COUNT where estado = 'desembolsado'
  pagados: number;            // COUNT where estado = 'pagado'
  total_defaults: number;     // COUNT where estado = 'default'
}

// GET /api/admin/participantes → 200
interface AdminParticipante extends ParticipanteRow {
  creditos_count: number;     // COUNT of creditos where prestatario_id
}

// GET /api/admin/audit-log → 200
interface AuditLogResponse {
  items: AuditLogRow[];       // with participante nombre joined
  total: number;              // total matching rows (for pagination)
  page: number;
  per_page: number;
}

// All admin endpoints → 401/403
interface AdminError {
  error: 'UNAUTHORIZED' | 'FORBIDDEN';
  detail: string;
}
```

### Supabase Queries

**Metrics** — single fetch, client-side aggregate:
```typescript
const { data: creditos } = await supabase.from('creditos').select('monto, estado');
const metrics = {
  total_prestado: creditos.filter(c => !['pendiente', 'avalado', 'aprobado'].includes(c.estado))
    .reduce((s, c) => s + Number(c.monto), 0),
  en_circulacion: creditos.filter(c => c.estado === 'desembolsado').length,
  pagados: creditos.filter(c => c.estado === 'pagado').length,
  total_defaults: creditos.filter(c => c.estado === 'default').length,
};
```

**Audit log** — paginated with total count:
```typescript
const page = Math.max(1, Number(params.get('page')) || 1);
const perPage = Math.min(50, Math.max(1, Number(params.get('per_page')) || 20));
const from = (page - 1) * perPage;
const to = from + perPage - 1;

const { data, count } = await supabase
  .from('audit_log')
  .select('*', { count: 'exact' })
  .order('fecha', { ascending: false })
  .range(from, to);
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `requireAdmin()` — 401 when no session, 403 when not admin, passes when admin | Mock `getServerUser`, mock Supabase `single()` |
| Integration | Each admin API route with mocked `requireAdmin` | Call handler, assert response shape |
| Integration | Middleware admin redirect | `NextRequest` with session, assert redirect on non-admin |
| E2E | Dashboard page renders metric cards | Browser test with admin session cookie |

## Migration / Rollout

1. **Migration 005** — `ALTER TYPE rol_participante ADD VALUE 'admin'` — additive, no downtime
2. **Seed admin user** — `INSERT INTO participantes (wallet_address, nombre, rol, score_reputacion, user_id) VALUES (...)` — manual post-deploy
3. **Deploy files** — All new files can be deployed together; middleware change is the only risk point (ensures admin check doesn't break non-admin dashboard routes)

## Open Questions

- [ ] How will the admin user be seeded? Manual INSERT via Supabase dashboard, or a seed script?

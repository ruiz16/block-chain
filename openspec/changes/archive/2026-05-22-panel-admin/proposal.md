# Proposal: Panel Admin

## Intent

Platform operators need read-only visibility into KPIs, participant activity, and audit history. Currently no admin interface exists. This change delivers a protected admin dashboard.

## Scope

### In Scope
- `GET /api/admin/metrics` — aggregated KPIs
- `GET /api/admin/participantes` — all participants with credit counts
- `GET /api/admin/audit-log` — paginated, filterable
- `/admin` dashboard page — metric cards, audit log table, quick actions
- Admin role guard — `participantes.rol = 'admin'` check

### Out of Scope
- Admin write actions (modify credits, scores, user CRUD)
- Charts / visualizations
- Role management (promote/demote users)

## Capabilities

### New Capabilities
- `admin-api`: Metrics, participants-with-credits, paginated audit-log endpoints
- `admin-dashboard`: Protected `/admin` page with metric cards, audit log table, quick-action links

### Modified Capabilities
- `user-auth`: Middleware adds admin role check on `/admin` routes — non-admin users get 403

## Approach

Three new routes under `/api/admin/*` guarded by a shared `requireAdmin()` helper that looks up `participantes.rol` via the session's `user_id`. The dashboard page at `/(dashboard)/admin/page.tsx` fetches client-side from the admin API.

### Required DB & Type Changes
- `admin` role does NOT exist in `rol_participante` enum — needs migration `005_admin.sql`
- Add `'admin'` to TS `RolParticipante` union
- Admin-specific RLS policies on `audit_log` and `participantes` SELECT

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/app/api/admin/*` | New | metrics, participantes, audit-log handlers |
| `src/app/(dashboard)/admin/` | New | Dashboard page |
| `src/middleware.ts` | Modified | Admin role guard |
| `src/types/database.ts` | Modified | Add `'admin'` to `RolParticipante` |
| `supabase/migrations/005_admin.sql` | New | Add enum value, RLS policies |
| `openspec/specs/user-auth/spec.md` | Modified | Admin guard requirement |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Admin role missing from DB enum | High | `ALTER TYPE ... ADD VALUE 'admin'` in migration |
| No admin users seeded | High | Manual INSERT post-deploy |
| Metrics perf on large datasets | Low | Composite indexes on `creditos.estado` |

## Rollback Plan

1. Remove `/api/admin/*` and `/(dashboard)/admin/`
2. Revert middleware admin guard
3. Migration is additive — safe to keep

## Dependencies

- Supabase service-role key (already available)
- Migration `005_admin.sql` to add `'admin'` to enum

## Success Criteria

- [ ] `GET /api/admin/metrics` returns KPIs matching raw DB counts
- [ ] `GET /api/admin/audit-log` returns paginated filterable results
- [ ] Non-admin users get 403 on `/admin` and all `/api/admin/*` endpoints
- [ ] `/admin` page renders metric cards and audit log table without errors

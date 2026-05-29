# Proposal: Gestión de Avales

## Intent

Enable assignment and revocation of avales (guarantors) to credits. The credit lifecycle requires `pendiente → avalado → aprobado`, but no API or UI exists to create that transition. Users need to assign and revoke guarantors from the approval panel.

## Scope

### In Scope
- `POST /api/avales` — assign guarantor, transition credit to `avalado`
- `GET /api/avales` — list avales by `credito_id` or `participante_id`
- `PATCH /api/avales/[id]/revocar` — mark aval inactive (only if not desembolsado)
- `GestorAvales.tsx` — client component in PanelAprobacion style
- DB migration: extend `tipo_accion` enum, fix trigger audit mapping
- Integration with `/aprobacion` page

### Out of Scope
- Notifications to avaladores
- Score-based aval cascading
- Prorrateo de garantías
- Multi-aval per credit (enforced by existing UNIQUE constraint)

## Capabilities

### New Capabilities
- `avales-api`: REST endpoints for aval CRUD operations

### Modified Capabilities
- `guarantor-system`: update requirements to match assign/revoke workflow
- `approval-ui`: integrate `GestorAvales` component
- `credit-lifecycle`: clarify `pendiente → avalado` transition rules
- `audit-trail`: add `aval_agregado`, `aval_revocado` to tipo_accion enum

## Approach

- Follow existing pattern from `desembolso/route.ts`: Zod validation, Supabase service client, audit logger
- New Zod schema in `src/lib/validations/avales.ts`
- Migration 002 to ALTER TYPE `tipo_accion` (add audit values) + fix trigger CASE for `avalado`
- `GestorAvales` as client component with states: loading/empty/list/asignando/revocando/error
- Server validates: participant exists, credit in `pendiente`, avalador ≠ prestatario, no duplicate aval
- Revoke guard: credit must NOT be in `desembolsado` or beyond

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/app/api/avales/route.ts` | New | POST + GET handlers |
| `src/app/api/avales/[id]/revocar/route.ts` | New | PATCH revoke handler |
| `src/lib/validations/avales.ts` | New | Zod schemas |
| `src/components/creditos/GestorAvales.tsx` | New | Client component |
| `src/app/(dashboard)/aprobacion/page.tsx` | Modified | Pass aval data, render GestorAvales |
| `src/types/database.ts` | Modified | API response types for avales |
| `supabase/migrations/002_extend_avales.sql` | New | Extend enum + fix trigger |
| `openspec/specs/` | Modified | 4 spec files |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Trigger maps `avalado` → `credito_aprobado` in audit | High | Fix CASE in existing trigger function |
| Self-assignment (avalador = prestatario) | Low | Validate on API layer |
| Revoke after disbursement | Low | State check before PATCH |

## Rollback Plan

- DB: DROP migration 002, restore trigger to previous state
- Code: revert new route files, component, validation schema
- Specs: revert delta specs

## Dependencies

- Migration 001 applied (avales table already exists)

## Success Criteria

- [ ] `POST /api/avales` inserts aval row + transitions credit to `avalado` + creates audit log
- [ ] `GET /api/avales?credito_id=X` returns only avales for that credit
- [ ] `GET /api/avales?participante_id=X` returns avales where user is avalador or avalado
- [ ] `PATCH` revocar marks aval `activo = false` (rejected if credito not in `pendiente`/`avalado`)
- [ ] `GestorAvales` renders in `/aprobacion`, allows assign/revoke without full page reload
- [ ] Audit log shows `aval_agregado` on assign and `aval_revocado` on revoke

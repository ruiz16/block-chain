# Tasks: Gestión de Avales

## Phase 1: DB Migration

- [x] 1.1 Create `supabase/migrations/002_avales.sql` — DO block adding `'aval_agregado'` and `'aval_revocado'` to `tipo_accion` enum (pg_enum idempotency check)
- [x] 1.2 Fix trigger `audit_credito_estado_change` CASE: add `WHEN NEW.estado = 'avalado' THEN 'aval_agregado'::tipo_accion` BEFORE the ELSE clause (also handles `avalado → pendiente` → `'aval_revocado'`)
- [x] 1.3 Add `CREATE INDEX idx_avales_credito_id ON avales (credito_id)`

## Phase 2: Types + Validation

- [x] 2.1 Update `src/types/database.ts` — add `TipoAccion` union (`'credito_creado' | 'credito_aprobado' | 'desembolso' | 'desembolso_fallo' | 'pago_recibido' | 'default_registrado' | 'aval_agregado' | 'aval_revocado'`), update `AuditLogRow.accion` to use `TipoAccion`, add `AsignarAvalInput` and `AvalConParticipante` interfaces
- [x] 2.2 Create `src/lib/validations/avales.ts` — `AsignarAvalSchema` (`credito_id`, `avalador_id` — both uuid, `.strict()`), `RevocarAvalParamsSchema` (`id` uuid), `AvalQuerySchema` (`credito_id` and `participante_id` optional uuid), mirror `desembolso.ts` pattern with validate wrappers

## Phase 3: API Routes

- [x] 3.1 Create `src/app/api/avales/route.ts` — **POST**: Zod validate, fetch credito (404/`pendiente` or 409), fetch avalador (404/role `aval`|`prestamista` or 403), check no self-assign (400), check no duplicate (409), INSERT aval (default `monto_maximo` from credit monto), UPDATE credito to `avalado`, `registrarAuditLog('aval_agregado')`, return 201. **GET**: filter by `credito_id` or `participante_id`, join `participantes` for name/wallet, return 200 array
- [x] 3.2 Create `src/app/api/avales/[id]/revocar/route.ts` — **PATCH**: validate id UUID (400), fetch aval (404/active), check credito not disbursed/pagado/default (409), SET `activo=false`, COUNT remaining active avales, UPDATE credito to `pendiente` if count=0, `registrarAuditLog('aval_revocado')`, return 200

## Phase 4: UI Component

- [x] 4.1 Create `src/components/avales/GestorAvales.tsx` — 6 states (`loading`, `empty`, `list`, `assigning`, `revoking`, `error`), `GestorAvalesProps { creditoId, prestatarioId, onEstadoChange? }`, fetch avales on mount via `GET /api/avales?credito_id=X`, render list with avalador name + wallet (truncated) + monto_maximo (formatted) + date + [Revocar] button, "Agregar Aval" button with inline UUID input field, confirmation before revoke ("¿Revocar aval de {nombre}?"), matches `PanelAprobacion` style patterns

## Phase 5: Integration

- [x] 5.1 Update `src/app/(dashboard)/aprobacion/page.tsx` — fetch aval counts alongside creditos, include `prestatario_id` in query, render `<GestorAvales>` per credit row via `renderAvalManager` prop, show aval count badge next to credit estado chip in the "Estado" column

### Dependencies

- Phase 2 depends on Phase 1 (types reference new enum values)
- Phase 3 depends on Phase 2 (API uses Zod schemas and new types)
- Phase 4 depends on Phase 3 (UI fetches from API routes)
- Phase 5 depends on Phase 4 (page renders GestorAvales)

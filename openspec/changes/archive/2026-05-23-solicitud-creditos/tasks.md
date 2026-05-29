# Tasks: Solicitud de Créditos + Loan Terms + Approval Flow

## Phase 1: Migration

- [x] 1.1 Create `supabase/migrations/006_loan_terms.sql`:
  `ALTER TABLE creditos ADD COLUMN interes_porcentaje NUMERIC(5,2) NOT NULL DEFAULT 0`,
  `ADD COLUMN plazo_dias INTEGER NOT NULL DEFAULT 30`,
  `ADD COLUMN fecha_vencimiento TIMESTAMPTZ`

## Phase 2: Types + Validations

- [x] 2.1 Update `src/types/database.ts`:
  Add `interes_porcentaje: number | string`, `plazo_dias: number`,
  `fecha_vencimiento: string | null` to `CreditoRow`.
  Add `SolicitarCreditoInput { monto: number; descripcion?: string; plazo_dias: number }`.
  Add `AprobarCreditoResponse { status: 'aprobado'; credito_id: string }`.

- [x] 2.2 Create `src/lib/validations/creditos.ts`:
  `SolicitarCreditoSchema = z.object({ monto: z.number().positive(), plazo_dias: z.number().int().min(30).max(365), descripcion: z.string().max(500).optional() }).strict()`

## Phase 3: API Routes

- [x] 3.1 Create `src/app/api/creditos/route.ts`:
  POST: `cookies()` → `getServerUser` (401) → lookup participante by `user_id`
  (404) → Zod validate body (400) → INSERT credito `estado='pendiente'` with
  `interes_porcentaje=10` (fixed rate), `plazo_dias` from body →
  `registrarAuditLog('credito_creado')` → 201.
  GET: same session flow → query `creditos WHERE prestatario_id` ORDER BY
  `fecha_solicitud DESC` → 200 array (empty if no participante). Mirrors
  `mis-creditos/route.ts` pattern.

- [x] 3.2 Create `src/app/api/creditos/[id]/aprobar/route.ts`:
  PATCH: `requireAdmin(request)` (returns 401/403 via `RequireAdminResult`;
  check with `instanceof Response`) → fetch credito (404 if missing) →
  validate `estado IN ('pendiente','avalado')` (409 `ESTADO_INCORRECTO` if
  not) → UPDATE: `estado='aprobado'`,
  `fecha_vencimiento = NOW() + plazo_dias` (computed in JS) →
  `registrarAuditLog('credito_aprobado')` → 200 `{ status: 'aprobado',
  credito_id }`.
  NOTE: per specs §7, approval from `pendiente` allowed with zero avales.

## Phase 4: UI Components

- [x] 4.1 Create `src/components/creditos/SolicitarCredito.tsx`:
  Client component. 4 states: `idle` (form: monto input, descripcion textarea,
  plazo_dias select with presets 30/60/90/180/365), `submitting` (disabled
  controls + spinner), `success` (confirmation + link to `/mis-creditos`),
  `error` (message + retry button). Submit → `POST /api/creditos`.

- [x] 4.2 Create `src/app/(dashboard)/solicitar/page.tsx`:
  Server page wrapping `<SolicitarCredito />`. Metadata: title="Solicitar
  Crédito — BlockChain", description="Solicita un nuevo crédito".

- [x] 4.3 Update `src/components/creditos/PanelAprobacion.tsx`:
  Replace single `handleApprove` (always called `POST /api/desembolso`) with
  `handleAction(creditoId, estado)` routing: if `estado IN ('pendiente','avalado')`
  → `PATCH /api/creditos/{id}/aprobar` (on success: update `creditEstados[id]='aprobado'`,
  keep row in list). If `estado='aprobado'` → `POST /api/desembolso` (existing
  behavior: remove row on success). Replace global `isApproving` with per-row
  `Record<string, boolean> isLoading` so one row's action doesn't block others.
  Error state per-row inline instead of global error banner.

- [x] 4.4 Update `src/app/(dashboard)/aprobacion/page.tsx`:
  Also fetch credits in `'aprobado'` state in addition to `'pendiente'` and
  `'avalado'` (change the `.in('estado', ...)` filter). The rest of the query
  stays the same — `PanelAprobacion` will route actions based on `estado`.

## Phase 5: Verify

- [x] 5.1 Run `npx tsc --noEmit` — fix any type errors so compilation passes cleanly.

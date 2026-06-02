# Design: Gestión de Avales

## Technical Approach

Follow existing desembolso pattern (Zod → Supabase service client → audit logger) for all API routes. The `avales` table already exists from migration 001 with its UNIQUE constraint. Migration 002 extends `tipo_accion` enum, fixes the trigger CASE that incorrectly maps `avalado` → `credito_aprobado`, and adds an index. `GestorAvales` mirrors `PanelAprobacion`'s explicit state machine.

## Architecture Decisions

| Decision | Options | Tradeoff | Chosen |
|----------|---------|----------|--------|
| Avalador validation layer | Route handler vs DB trigger | Trigger is atomic but can't return rich messages (e.g. "avalador must be a valid participant"). Route handler can return i18n-ready error codes. | **Route handler** — richer errors |
| Credit state on revoke | Always revert to `pendiente` vs count-based | If a credit has 2 avales (currently prohibited by UNIQUE on prestatario+credito, but possible if expanded), revoking one shouldn't drop the credit. Count-based is future-proof. | **Count active avales** — revert to `pendiente` only when count = 0 |
| GestorAvales placement | Inline in PanelAprobacion vs standalone | Inline is simpler now but couples concerns. Standalone follows single-responsibility and allows reuse in a future detail page. | **Standalone component** at `components/avales/` |
| Enum extension | Raw ALTER TYPE vs DO block | ALTER TYPE ... ADD VALUE inside a transaction errors if value exists. DO block with pg_enum check is idempotent and safe for re-runs. | **DO block** — idempotent migrations |

## Data Flow

### Asignar Aval (POST /api/avales)

```
GestorAvales          POST /api/avales          Supabase          Audit Log
    │                       │                       │                  │
    │── fetch POST ────────→│                       │                  │
    │                       │── Zod validation ──→  │                  │
    │                       │← 400 on fail ────────│                  │
    │                       │                       │                  │
    │                       │── fetch credito ────→ │                  │
    │                       │← estado=pendiente ───│                  │
    │                       │ (404/409 if fail)     │                  │
    │                       │                       │                  │
    │                       │── fetch avalador ───→ │                  │
    │                       │← exists, role ok ────│                  │
    │                       │ (404/403 if fail)     │                  │
    │                       │                       │                  │
    │                       │── check dup aval ───→ │                  │
    │                       │← no active dupe ─────│                  │
    │                       │ (409 if exists)       │                  │
    │                       │                       │                  │
    │                       │── INSERT aval ──────→ │                  │
    │                       │── UPDATE credito ───→ │                  │
    │                       │   estado=avalado      │                  │
    │                       │                       │── INSERT ─────→ │
    │                       │                       │   aval_agregado  │
    │← 201 + aval data ────│                       │                  │
```

### Revocar Aval (PATCH /api/avales/{id}/revocar)

```
GestorAvales     PATCH /api/avales/{id}/revocar     Supabase        Audit Log
    │                        │                          │                │
    │── fetch PATCH ────────→│                          │                │
    │                        │── fetch aval ──────────→ │                │
    │                        │← exists, activo=true ───│                │
    │                        │  (404/409 if fail)       │                │
    │                        │                          │                │
    │                        │── fetch credito ───────→ │                │
    │                        │← estado != desembolsado ─│                │
    │                        │  (409 if too late)       │                │
    │                        │                          │                │
    │                        │── UPDATE aval ─────────→ │                │
    │                        │   SET activo = false     │                │
    │                        │                          │                │
    │                        │── COUNT active avales ─→ │                │
    │                        │   for this credito       │                │
    │                        │                          │                │
    │                        │── IF count=0 ──────────→ │                │
    │                        │   UPDATE credito         │                │
    │                        │   estado=pendiente       │                │
    │                        │                          │── INSERT ───→ │
    │                        │                          │ aval_revocado  │
    │← 200 + success ───────│                          │                │
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/app/api/avales/route.ts` | Create | POST (asignar) + GET (listar) |
| `src/app/api/avales/[id]/revocar/route.ts` | Create | PATCH (revocar) |
| `src/lib/validations/avales.ts` | Create | Zod schemas for avales API |
| `src/components/avales/GestorAvales.tsx` | Create | Client component, 6 states |
| `src/app/(dashboard)/aprobacion/page.tsx` | Modify | Pass aval data per credit, render GestorAvales |
| `src/types/database.ts` | Modify | Add `AvalResponse`, `AvalListResponse` types |
| `supabase/migrations/002_extend_avales.sql` | Create | Extend enum, fix trigger, add index |

## Interfaces / Contracts

### Zod Schemas (`lib/validations/avales.ts`)

```typescript
export const AsignarAvalSchema = z.object({
  credito_id: z.string().uuid('credito_id debe ser un UUID válido'),
  aval_id: z.string().uuid('aval_id debe ser un UUID válido'),
  monto_maximo: z.string().min(1, 'monto_maximo es requerido'),
}).strict();

export const AvalQuerySchema = z.object({
  credito_id: z.string().uuid().optional(),
  participante_id: z.string().uuid().optional(),
}).strict();
```

### API Types (`types/database.ts` — additions)

```typescript
export interface AvalResponse {
  id: string;
  aval_id: string;
  prestatario_id: string;
  credito_id: string;
  monto_maximo: string;
  activo: boolean;
  fecha_creacion: string;
  avalador_nombre?: string;
}

export interface RevocarResponse {
  status: 'revocado';
  credito_estado: string;
}

export interface AvalAsignadoResponse {
  status: 'aval_asignado';
  aval: AvalResponse;
  credito_estado: string;
}
```

### Component Props

```typescript
interface GestorAvalesProps {
  creditoId: string;
  prestatarioId: string;
}
```

States: `'loading' | 'empty' | 'list' | 'assigning' | 'revoking' | 'error'`

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Zod input validation | Test valid/invalid UUIDs, missing fields, strict mode |
| Integration | POST/PATCH endpoints | Mock Supabase client, assert DB calls + audit calls |
| Integration | Migration idempotency | Run migration SQL twice, assert no errors |
| Component | GestorAvales states | Render each state (loading/empty/list/error) with fake data |

## Migration / Rollout

1. **Migration 002** (`002_extend_avales.sql`):
   - DO block: `IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'aval_agregado') THEN ALTER TYPE tipo_accion ADD VALUE 'aval_agregado'; END IF;`
   - Same DO block for `aval_revocado`
   - `CREATE INDEX idx_avales_credito_id ON avales (credito_id);`
   - `CREATE OR REPLACE FUNCTION audit_credito_estado_change()` with fixed CASE: add `WHEN NEW.estado = 'avalado' THEN 'aval_agregado'::tipo_accion`

2. **Rollback**: Revert trigger function to original CASE, DROP index, no need to remove enum values (ADD VALUE can't be rolled back in Postgres — new values are harmless).

No feature flags required; endpoints and component are additive.

## Open Questions

- None. All decisions are covered by existing patterns and specs.

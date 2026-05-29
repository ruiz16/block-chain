# Design: Solicitud de Créditos + Loan Terms + Approval Flow

## Technical Approach

Follow established desembolso/pago patterns (Zod → Supabase service client → audit logger) for all routes. Loan terms added as nullable columns with defaults for backward compatibility. `PanelAprobacion` refactored to conditionally route to approval vs disbursement based on current `estado`. `requireAdmin()` pattern reused for approval endpoint — requires `NextRequest` not plain `Request`.

## Architecture Decisions

| Decision | Options | Tradeoff | Chosen |
|----------|---------|----------|--------|
| POST session resolution | `requireAdmin()` vs pago pattern (`cookies()` → `getServerUser`) | Admin guard is wrong for borrower endpoints. Pago pattern resolves auth user → participante → prestatario_id. | **Pago pattern** — non-admin, owner-gated |
| Approval guard | `requireAdmin()` vs manual guard | `requireAdmin()` exists and returns `RequireAdminResult` with participante. Approval is admin-only. | **requireAdmin()** — uses `NextRequest` (not plain `Request`) for cookie access |
| GET /api/creditos vs mis-creditos | Coexist vs replace | `/api/mis-creditos` is an existing working route. Replacing it breaks existing consumers. | **Keep both** — new GET aliases the same logic; mis-creditos deprecated but not removed |
| Approval UI state machine | Global `approving` flag (current) vs per-row tracking | Global flag disables ALL rows during one action. Per-row keeps rest of table interactive and is safer UX. | **Per-row isLoading** — `Record<string, boolean>` per credito ID |
| Loan term defaults | NOT NULL with defaults vs nullable | NOT NULL DEFAULT 0/30 means existing migration-safe and UI never renders null; proposal says DEFAULT NULL. | **NOT NULL DEFAULT 0/30** — simpler UI, no null-handling needed, backwards-compatible |

## Data Flow

### Credit Request (POST /api/creditos)
```
SolicitarCredito     POST /api/creditos       Supabase
      │                     │                     │
      │── POST ────────────→│                     │
      │                     │── Zod validation ──→│
      │                     │← 400 on fail ──────│
      │                     │                     │
      │                     │── cookies() ──────→ │
      │                     │── getServerUser ───→│
      │                     │← 401 if no session  │
      │                     │                     │
      │                     │── lookup participante
      │                     │   by user_id        │
      │                     │← 404 if not found   │
      │                     │                     │
      │                     │── INSERT credito    │
      │                     │   (estado=pendiente,│
      │                     │    interes_porcentaje,
      │                     │    plazo_dias)      │
      │                     │                     │
      │                     │── registrarAuditLog │
      │                     │   credito_creado    │
      │← 201 + credito ────│                     │
```

### Approval (PATCH /api/creditos/[id]/aprobar)
```
PanelAprobacion   PATCH /api/creditos/[id]/aprobar    Supabase
      │                        │                          │
      │── PATCH ──────────────→│                          │
      │                        │── requireAdmin() ──────→ │
      │                        │← 401/403 on fail         │
      │                        │                          │
      │                        │── fetch credito ───────→ │
      │                        │← 404 if missing          │
      │                        │                          │
      │                        │── validate estado IN     │
      │                        │   ('pendiente','avalado')│
      │                        │← 409 if wrong estado     │
      │                        │                          │
      │                        │── IF estado='pendiente': │
      │                        │   check active avales >0 │
      │                        │← 409 SIN_AVALES          │
      │                        │                          │
      │                        │── UPDATE credito         │
      │                        │   estado='aprobado'      │
      │                        │   fecha_vencimiento=     │
      │                        │   NOW()+plazo_dias       │
      │                        │                          │
      │                        │── registrarAuditLog      │
      │                        │   credito_aprobado       │
      │← 200 + {status} ──────│                          │
```

### Full Lifecycle State Transitions
```
SolicitarCredito → POST /api/creditos         → pendiente
  → Admin asigna avales (POST /api/avales)    → avalado
  → Admin aprueba (PATCH .../aprobar)         → aprobado
  → Admin desembolsa (POST /api/desembolso)   → desembolsado
  → Borrower paga (POST /api/pago)            → pagado
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/006_loan_terms.sql` | Create | ADD COLUMN interes_porcentaje, plazo_dias, fecha_vencimiento |
| `src/app/api/creditos/route.ts` | Create | POST (create credit, pago session pattern) + GET (list own, mirrors mis-creditos) |
| `src/app/api/creditos/[id]/aprobar/route.ts` | Create | PATCH (requireAdmin, validate estado, compute fecha_vencimiento) |
| `src/lib/validations/creditos.ts` | Create | Zod schemas: `CrearCreditoSchema`, `CreditoQuerySchema` |
| `src/components/creditos/SolicitarCredito.tsx` | Create | Client form, 4 states (idle/submitting/success/error), plazo presets 30/60/90/180/365 |
| `src/app/(dashboard)/solicitar/page.tsx` | Create | Server page wrapping SolicitarCredito |
| `src/components/creditos/PanelAprobacion.tsx` | Modify | Per-row estado badge + conditional "Aprobar" vs "Desembolsar" + per-row `isLoading` |
| `src/app/(dashboard)/aprobacion/page.tsx` | Modify | Fetch also `aprobado` credits; include loan terms in row data |
| `src/types/database.ts` | Modify | `CreditoRow` adds `interes_porcentaje`, `plazo_dias`, `fecha_vencimiento`; `CreditoPendiente` adds loan terms |

## Interfaces / Contracts

### Zod Schemas (`lib/validations/creditos.ts`)

```typescript
export const CrearCreditoSchema = z.object({
  monto: z.number().positive('El monto debe ser un número positivo'),
  plazo_dias: z.number().int().min(30, 'Plazo mínimo 30 días').max(365, 'Plazo máximo 365 días'),
  descripcion: z.string().max(500).optional(),
}).strict();

export type CrearCreditoInput = z.infer<typeof CrearCreditoSchema>;
```

### API Types — `CreditoRow` additions

```typescript
// Add to CreditoRow:
export interface CreditoRow {
  // ...existing fields...
  interes_porcentaje: number;    // new — NUMERIC(5,2) → number
  plazo_dias: number;            // new — INTEGER
  fecha_vencimiento: string | null; // new — TIMESTAMPTZ
}
```

### PanelAprobacion key behavioral change

```typescript
// Before: handleApprove always calls POST /api/desembolso
// After: conditional routing
const handleAction = (creditoId: string, estado: string) => {
  if (estado === 'pendiente' || estado === 'avalado') {
    fetch(`/api/creditos/${creditoId}/aprobar`, { method: 'PATCH' });
  } else if (estado === 'aprobado') {
    fetch('/api/desembolso', { method: 'POST', body: JSON.stringify({ credito_id: creditoId }) });
  }
};
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Zod schema validation | Test valid/invalid monto, plazo_dias range, optional descripcion |
| Integration | POST /api/creditos | Mock Supabase + session; assert 201, 401, 400 |
| Integration | PATCH /api/creditos/[id]/aprobar | Mock requireAdmin + Supabase; assert 200, 409 on wrong estado, 409 SIN_AVALES on pendiente without avales |
| Component | SolicitarCredito states | Render idle/submitting/success/error with fake callbacks |
| Component | PanelAprobacion action routing | Test that "Aprobar" button renders for pendiente/avalado, "Desembolsar" for aprobado |

## Migration / Rollout

1. **Migration 006** (`006_loan_terms.sql`):
   ```sql
   ALTER TABLE creditos ADD COLUMN interes_porcentaje NUMERIC(5,2) NOT NULL DEFAULT 0;
   ALTER TABLE creditos ADD COLUMN plazo_dias INTEGER NOT NULL DEFAULT 30;
   ALTER TABLE creditos ADD COLUMN fecha_vencimiento TIMESTAMPTZ;
   ```
   - Existing credits get `interes_porcentaje=0`, `plazo_dias=30`, `fecha_vencimiento=NULL`
   - Migration 005 already applied (admin rol, audit_log RLS)

2. **Rollback**: `ALTER TABLE creditos DROP COLUMN IF EXISTS interes_porcentaje, DROP COLUMN IF EXISTS plazo_dias, DROP COLUMN IF EXISTS fecha_vencimiento`

3. Deploy order: migration → types → API routes → components

## Open Questions

- None. All decisions map to existing codebase patterns.

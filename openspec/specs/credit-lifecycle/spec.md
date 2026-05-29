# credit-lifecycle Specification

## Purpose

Full lifecycle of a credit: request → approval → disbursement → repayment or default.

## Requirements

### Requirement: State Machine

The system MUST enforce the credit status workflow: `pendiente → avalado → aprobado → desembolsado → pagado | default`. The `pendiente → avalado` transition SHALL be triggered exclusively by assigning an aval via `POST /api/avales`. The `desembolsado → pagado` transition SHALL be triggered exclusively by a successful on-chain payment verification via `POST /api/pago`.

- GIVEN a credit in `pendiente` state
- WHEN a transition is attempted to any state outside the valid path
- THEN the operation MUST be rejected with `ESTADO_INCORRECTO`

### Requirement: Create Credit

A participant with rol `prestatario` SHALL create a credit request.

- GIVEN an active participant with rol `prestatario`
- WHEN they create a credit with `monto > 0`
- THEN the credit is created in `pendiente` state

### Requirement: Loan Terms Columns

The `creditos` table SHALL include the following loan term columns:

| Column | Type | Default | Constraint | Notes |
|--------|------|---------|------------|-------|
| `interes_porcentaje` | NUMERIC(5,2) | 0 | NOT NULL | Annual interest rate |
| `plazo_dias` | INTEGER | 30 | NOT NULL | Loan term in days |
| `fecha_vencimiento` | TIMESTAMPTZ | NULL | — | Maturity date, set at approval |

- GIVEN an existing migration
- WHEN `interes_porcentaje` is queried
- THEN it defaults to 0 for existing rows
- GIVEN an existing migration
- WHEN `plazo_dias` is queried
- THEN it defaults to 30 for existing rows
- GIVEN a credit in `pendiente` or `avalado` state
- WHEN it has not yet been approved
- THEN `fecha_vencimiento` is NULL

### Requirement: Approval Prerequisites

A credit SHALL be approvable from either `pendiente` or `avalado` state. The `pendiente → avalado` transition remains triggered by aval assignment via `POST /api/avales`, but is NOT a hard prerequisite for approval.

- GIVEN a credit in `pendiente` state with zero avales
- WHEN an admin approves the credit
- THEN the credit transitions to `aprobado` and `fecha_vencimiento` is set
- GIVEN a credit in `avalado` state
- WHEN an admin approves the credit
- THEN the credit transitions to `aprobado` and `fecha_vencimiento` is set

### Requirement: Admin Approval Endpoint

The system MUST allow an admin to approve a credit via `PATCH /api/creditos/[id]/aprobar`, transitioning `pendiente` or `avalado` → `aprobado` and setting `fecha_vencimiento`.

**Auth**: Admin only (`requireAdmin`)
**Valid transitions**: `pendiente` → `aprobado`, `avalado` → `aprobado`
**Side effect**: `fecha_vencimiento = NOW() + plazo_dias` (Postgres interval)
**Returns**: `200` on success

- GIVEN a credit in `avalado` state
- WHEN the PATCH endpoint is called by an admin
- THEN a 200 response is returned and `estado` becomes `"aprobado"`
- GIVEN a credit in `pendiente` state
- WHEN the PATCH endpoint is called by an admin
- THEN a 200 response is returned and `estado` becomes `"aprobado"`
- GIVEN a request with an invalid credit ID
- WHEN the PATCH endpoint is called
- THEN a 404 response is returned
- GIVEN a credit in `desembolsado` state
- WHEN the PATCH endpoint is called
- THEN a 409 Conflict response is returned
- GIVEN a request with a missing session cookie
- WHEN the PATCH endpoint is called
- THEN a 401 response is returned
- GIVEN a request from a non-admin user
- WHEN the PATCH endpoint is called
- THEN a 403 response is returned

### Requirement: Payment Transition

The `desembolsado → pagado` transition MUST verify a valid on-chain cUSD repayment before updating the credit.

- GIVEN a credit in `desembolsado` state
- WHEN `POST /api/pago` is called with a valid tx_hash
- THEN the system MUST verify the transaction exists on-chain via `verificarPago()`
- AND the credit transitions to `pagado` only if verification succeeds
- AND `fecha_pago` is set to the current timestamp
- AND `tx_hash_pago` is recorded

### Requirement: Payment Columns

The `creditos` table SHALL include `tx_hash_pago` and `fecha_pago` columns for recording repayment data.

- GIVEN a successful payment
- THEN `tx_hash_pago` stores the verified transaction hash
- AND `fecha_pago` is set to `NOW()`
- AND a unique partial index on `tx_hash_pago` prevents duplicate hash submissions

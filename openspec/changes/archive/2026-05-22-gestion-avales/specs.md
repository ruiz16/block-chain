# Delta Specs: Gestión de Avales

## ADDED — avales-api

### Requirement: POST /api/avales — Asignar Aval

The endpoint MUST accept `{ credito_id: string, avalador_id: string }`. The system MUST validate both are valid UUIDs, the credit exists in `pendiente` state, the avalador is a valid participant, the avalador is not the credit's prestatario, and no active aval exists for that credit. On success (201), the system SHALL insert an `avales` row with `activo = true`, transition the credit to `avalado`, and insert an `audit_log` row with `accion = 'aval_agregado'`.

#### Scenario: Asignar aval exitoso
- GIVEN a credit in `pendiente` and a participant with rol `aval` distinct from the prestatario
- WHEN `POST /api/avales` is called with valid `credito_id` and `avalador_id`
- THEN the response is 201
- AND the credit transitions to `avalado`
- AND an `avales` row is inserted with `activo = true`
- AND `audit_log` records `accion = 'aval_agregado'`

#### Scenario: Credit not in pendiente
- GIVEN a credit in `avalado` state
- WHEN `POST /api/avales` is called
- THEN the system responds 409 with `ESTADO_INCORRECTO`

#### Scenario: Duplicate aval
- GIVEN an existing active aval for the same credit
- WHEN a second aval is assigned
- THEN the system responds 409 with `AVAL_DUPLICADO`

#### Scenario: Self-assignment
- GIVEN the avalador_id equals the credit's prestatario_id
- WHEN `POST /api/avales` is called
- THEN the system responds 400 with `AVALADOR_INVALIDO`

### Requirement: GET /api/avales — Listar Avales

The endpoint SHOULD filter by `credito_id` or `participante_id` query params. It MUST return an array of avales with joined participant names. It SHALL always respond 200 (empty array if none).

#### Scenario: Filter by credito
- GIVEN 2 avales for credit A and 1 for credit B
- WHEN `GET /api/avales?credito_id=A` is called
- THEN the response contains exactly 2 avales

### Requirement: PATCH /api/avales/{id}/revocar — Revocar Aval

The endpoint MUST mark the aval as `activo = false`. It MUST reject if the credit is in `desembolsado`, `pagado`, or `default` (409 `ESTADO_INCORRECTO`). If no other active avales remain, the system SHALL return the credit to `pendiente`. An `audit_log` row with `accion = 'aval_revocado'` SHALL be inserted.

#### Scenario: Revoke with remaining avales
- GIVEN a credit with 2 active avales in `avalado`
- WHEN one aval is revoked
- THEN the aval is marked `activo = false`
- AND the credit stays `avalado`
- AND `audit_log` records `aval_revocado`

#### Scenario: Revoke last aval → pendiente
- GIVEN a credit with 1 active aval in `avalado`
- WHEN that aval is revoked
- THEN the credit returns to `pendiente`

## ADDED — GestorAvales UI

### Requirement: Manage Guarantors from Approval Panel

The system SHALL render a `GestorAvales` component inside `/aprobacion`. It MUST display active avales (name, monto_maximo, date, revoke button). It MUST include an "Agregar Aval" button that opens a form to search/select an avalador. A confirmation dialog MUST appear before revoking. The component MUST handle states: loading (skeleton), empty ("Sin avales asignados"), list, assigning (spinner on button), revoking, and error (alert with retry).

#### Scenario: Assign from UI
- GIVEN the approval panel showing a credit in `pendiente`
- WHEN the user clicks "Agregar Aval" and selects an avalador
- THEN the component shows "Asignando…"
- AND on success the aval appears in the list
- AND the credit state chip updates to `avalado`

#### Scenario: Revoke with confirmation
- GIVEN an active aval in the list
- WHEN the user clicks [Revocar]
- THEN a confirmation dialog "¿Revocar aval de {nombre}?" is shown
- WHEN confirmed
- THEN the aval is removed from the list
- AND if it was the last aval, the credit returns to `pendiente`

## MODIFIED — credit-lifecycle

### Requirement: State Machine

The system MUST enforce the credit status workflow: `pendiente → avalado → aprobado → desembolsado → pagado | default`. The `pendiente → avalado` transition SHALL be triggered exclusively by assigning an aval via `POST /api/avales`.
(Previously: No explicit trigger for `pendiente → avalado`)

- GIVEN a credit in `pendiente` state
- WHEN a transition is attempted to any state outside the valid path
- THEN the operation MUST be rejected with `ESTADO_INCORRECTO`

### Requirement: Approval Prerequisites

A credit MUST be in `avalado` state (one or more active avales) before transitioning to `aprobado`.
(Previously: The system would auto-transition to `avalado` when approval was attempted without avales)

- GIVEN a credit in `pendiente` with zero active avales
- WHEN an approval is attempted
- THEN the system MUST reject with `SIN_AVALES`

## MODIFIED — audit-trail

### Requirement: Mandatory Logging

Every state transition on `creditos` MUST produce a corresponding `audit_log` row.
(Previously: Only covered `aval_agregado`)

- GIVEN a credit transitioning from `pendiente` to `avalado`
- WHEN the transition succeeds
- THEN an `audit_log` row MUST be inserted with `accion = 'aval_agregado'`

- GIVEN a credit transitioning from `avalado` back to `pendiente` (last aval revoked)
- WHEN the transition succeeds
- THEN an `audit_log` row MUST be inserted with `accion = 'aval_revocado'`

## MODIFIED — approval-ui

### Requirement: Integrate GestorAvales

The approval panel SHALL render `GestorAvales` for each credit row. It MUST display the aval state alongside the credit state and enable assign/revoke without full page reload.
(Previously: No aval management in approval panel)

- GIVEN a credit row in the approval table
- WHEN the component mounts
- THEN avales for that credit are fetched via `GET /api/avales?credito_id=X`
- AND the aval count is shown in a badge next to the credit state

## Infrastructure — DB Migration

### Requirement: Extend tipo_accion Enum

The system MUST `ALTER TYPE tipo_accion ADD VALUE 'aval_agregado'` and `ADD VALUE 'aval_revocado'`.

### Requirement: Fix Trigger Audit Mapping

The trigger `audit_credito_estado_change` CASE block MUST map `WHEN NEW.estado = 'avalado' THEN 'aval_agregado'::tipo_accion`.

### Requirement: New Index

The system MUST create index `idx_avales_credito_id` on `avales(credito_id)`.

## MODIFIED — guarantor-system

### Requirement: Cascade on Score

If an aval's `score_reputacion` drops below 30, their active avales SHOULD be flagged for review.
(Unchanged — still valid)

- GIVEN an aval with active avales
- WHEN their score drops to 25
- THEN a warning is logged in the audit trail

### REMOVED — guarantor-system: Create Aval

Replaced by `POST /api/avales` (avales-api). The API endpoint now performs all creation logic.
(Reason: Moved from direct participant action to API-driven workflow)

### REMOVED — guarantor-system: Unique Constraint

The unique constraint remains at the DB level but the enforcement is now handled by the API layer returning 409 `AVAL_DUPLICADO`.
(Reason: Enforcement responsibility shifted to API layer)

# avales-api Specification

## Purpose

REST API endpoints for managing avales (guarantors) on credits — assign, list, and revoke.

## Requirements

### Requirement: POST /api/avales — Asignar Aval

The endpoint MUST accept `{ credito_id: string, avalador_id: string }`. The system MUST validate both are valid UUIDs, the credit exists in `pendiente` state, the avalador exists with rol `aval` or `prestamista`, the avalador is not the credit's prestatario, and no active aval exists for that credit. On success (201), the system SHALL insert an `avales` row with `activo = true`, transition the credit to `avalado`, and insert an `audit_log` row with `accion = 'aval_agregado'`.

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

#### Scenario: Filter by participante
- GIVEN avales where participant X is avalador
- WHEN `GET /api/avales?participante_id=X` is called
- THEN the response contains only avales for that participant

### Requirement: PATCH /api/avales/{id}/revocar — Revocar Aval

The endpoint MUST mark the aval as `activo = false`. It MUST reject if the credit is in `desembolsado`, `pagado`, or `default` (409 `ESTADO_INCORRECTO`). If no other active avales remain, the system SHALL return the credit to `pendiente`. An `audit_log` row with `accion = 'aval_revocado'` SHALL be inserted.

#### Scenario: Revoke with remaining avales
- GIVEN a credit with 2 active avales in `avalado`
- WHEN one aval is revoked
- THEN the aval is marked `activo = false`
- AND the credit stays `avalado`
- AND `audit_log` records `aval_revocado`

#### Scenario: Revoke last aval -> pendiente
- GIVEN a credit with 1 active aval in `avalado`
- WHEN that aval is revoked
- THEN the credit returns to `pendiente`

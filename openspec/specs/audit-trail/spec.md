# audit-trail Specification

## Purpose

Immutable, append-only log recording every financial action on the platform.

## Requirements

### Requirement: Append-Only

The audit_log table MUST be INSERT-only. No UPDATE or DELETE operations SHALL be permitted on it.

- GIVEN an existing audit_log row
- WHEN an UPDATE is attempted
- THEN the database MUST reject the operation

### Requirement: Mandatory Logging

Every state transition on `creditos` MUST produce a corresponding `audit_log` row.

- GIVEN a credit transitioning from `pendiente` to `avalado`
- WHEN the transition succeeds
- THEN an `audit_log` row MUST be inserted with `accion = 'aval_agregado'`

- GIVEN a credit transitioning from `avalado` back to `pendiente` (last aval revoked)
- WHEN the transition succeeds
- THEN an `audit_log` row MUST be inserted with `accion = 'aval_revocado'`

### Requirement: JSONB Details

The `detalles` column MUST store structured data relevant to the action.

- GIVEN a desembolso action
- WHEN the audit log is written
- THEN `detalles` MUST include `{ monto, tx_hash, score_reputacion }`

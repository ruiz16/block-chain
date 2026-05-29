# gestor-avales Specification

## Purpose

GestorAvales client component for managing guarantors within the approval panel — assign, list, and revoke avales with full state machine handling.

## Requirements

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

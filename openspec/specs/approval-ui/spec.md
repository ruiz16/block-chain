# approval-ui Specification

## Purpose

`PanelAprobacion` component for reviewing and approving/rejecting pending credits.

## Requirements

### Requirement: State Rendering

The component MUST render distinct UIs for each state: loading, empty, list, approving, success, error.

- GIVEN the component is mounted
- WHEN data is being fetched
- THEN a skeleton spinner with `aria-busy="true"` is shown
- WHEN no pending credits exist
- THEN an empty state with "No hay créditos pendientes de aprobación" is shown
- WHEN pending credits are returned
- THEN a table with columns (monto, prestatario, score, fecha, actions) is rendered

### Requirement: Two-Step Action Flow

The component MUST show a state-based action per credit row. For `pendiente`/`avalado` credits: an "Aprobar" button that calls `PATCH /api/creditos/{id}/aprobar`. For `aprobado` credits: a "Desembolsar" button that calls `POST /api/desembolso`. Per-row action state isolation — one row's loading/error state MUST NOT affect other rows.

- GIVEN a credit in `pendiente` or `avalado` state
- WHEN the user clicks "Aprobar"
- THEN `estado` transitions to `aprobado` and the button changes to "Desembolsar"
- GIVEN a credit in `aprobado` state
- WHEN the user clicks "Desembolsar"
- THEN `POST /api/desembolso` is called, and on success the credit is removed from the list
- GIVEN a credit row being approved
- WHEN the API returns an error
- THEN the row shows an inline error message while other rows remain interactive
- GIVEN a credit row being disbursed
- WHEN the API returns an error
- THEN the row shows an inline error message while other rows remain interactive

### Requirement: CeloScan Link

The component MUST include a `CeloScanLink` that opens in a new tab.

- GIVEN a successful disbursement with `tx_hash`
- WHEN the success banner is rendered
- THEN a link to `https://alfajores.celoscan.io/tx/{tx_hash}` is displayed
- AND the link has `target="_blank" rel="noopener noreferrer"`
- AND `aria-label="Ver transacción en CeloScan"`

### Requirement: Accessibility

The component MUST meet WCAG AA accessibility requirements.

- GIVEN interactive elements (buttons, links)
- THEN they MUST be keyboard-navigable
- GIVEN icon-only controls
- THEN they MUST have descriptive `aria-label`
- GIVEN status banners
- THEN they MUST use `role="alert"`

### Requirement: Integrate GestorAvales

The approval panel SHALL render `GestorAvales` for each credit row. It MUST display the aval state alongside the credit state and enable assign/revoke without full page reload.

- GIVEN a credit row in the approval table
- WHEN the component mounts
- THEN avales for that credit are fetched via `GET /api/avales?credito_id=X`
- AND the aval count is shown in a badge next to the credit state

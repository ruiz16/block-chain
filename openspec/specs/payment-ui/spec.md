# payment-ui Specification

## Purpose

Borrower-facing payment dashboard — display active credits, submit transaction hash for repayment, view all credits.

---

## PanelPagos — Active Payment Dashboard

### Overview

Client component that displays the authenticated borrower's active credits (`desembolsado` state) and allows them to submit a transaction hash for repayment.

### Requirement: Component Structure

The component MUST be a client component using `"use client"`.

### Requirement: Data Fetching

The component MUST fetch credits via `GET /api/mis-creditos` on mount and filter to only show credits in `desembolsado` state.

### Requirement: Loading State

- GIVEN the component is mounted and the API call is in-flight
- THEN show a loading indicator (spinner or skeleton)
- AND disable the payment form

### Requirement: Empty State

- GIVEN the API returns an empty array (user has no credits)
- THEN show a message: "No tienes créditos activos"

- GIVEN the API returns credits but none in `desembolsado` state
- THEN show a message: "No tienes pagos pendientes"

### Requirement: Active Credit List

The component MUST display a list of active credits. Each credit row SHALL show:

| Field | Source |
|-------|--------|
| Monto (cUSD) | `monto` formatted from wei via `formatCusd()` |
| Fecha de desembolso | `fecha_actualizacion` (when estado changed to desembolsado) |
| TxHash del desembolso | `tx_hash` — linked to CeloScan via `getCeloScanUrl()` |
| Botón "Registrar Pago" | Triggers inline form for this credit |

### Requirement: Payment Form

When the user clicks "Registrar Pago" for a credit, an inline form SHALL appear:

- Text input for the transaction hash (0x-prefixed)
- "Confirmar Pago" submit button
- "Cancelar" button to collapse the form
- The form MUST only be open for one credit at a time

### Requirement: Form Validation

The component MUST validate the tx_hash format before submitting:

- GIVEN the user enters text that does not start with `0x`
- WHEN they click "Confirmar Pago"
- THEN show inline error: "El hash debe comenzar con 0x"

- GIVEN the user enters a hash shorter than 66 characters (0x + 64 hex chars)
- WHEN they click "Confirmar Pago"
- THEN show inline error: "El hash debe ser un hex válido de 64 caracteres"

### Requirement: Submitting State

- GIVEN the form is submitted
- AND the POST /api/pago call is in-flight
- THEN disable both the input and the submit button
- AND show a loading spinner on the button

### Requirement: Success State

- GIVEN the API returns 200
- THEN remove the credit from the active list (it's now `pagado`)
- AND show a success toast or inline message: "Pago registrado exitosamente"
- AND reset the form

### Requirement: Error State

The component MUST handle API errors gracefully and show user-friendly messages:

| Error Code | User-Facing Message |
|-----------|-------------------|
| `TX_NO_ENCONTRADA` | "La transacción no existe en la blockchain" |
| `TX_REVERTIDA` | "La transacción fue revertida en la blockchain" |
| `TX_DESTINO_INVALIDO` | "La transacción no es al contrato de cUSD" |
| `TX_MONTO_INSUFICIENTE` | "El monto enviado es menor al crédito" |
| `TX_BENEFICIARIO_INVALIDO` | "El destinatario no es la wallet de la plataforma" |
| `ESTADO_INCORRECTO` | "El crédito no está en estado de pago pendiente" |
| `YA_PAGADO` | "Este crédito ya fue pagado" |
| `TX_HASH_DUPLICADO` | "Este hash de transacción ya fue registrado" |
| `ERROR_INTERNO` | "Error del servidor. Intenta de nuevo más tarde" |
| (network error) | "Error de conexión. Verifica tu conexión a internet" |

### Requirement: CeloScan Link

Each credit row MUST show a link to the disbursement transaction on CeloScan using `getCeloScanUrl(tx_hash)`.

---

## MisCreditosClient — All Credits View

### Overview

Client component that displays ALL the authenticated borrower's credits in a read-only table, regardless of estado. Rendered inside `/mis-creditos`.

### Requirement: All Credits Table

- GIVEN an authenticated user with credits
- WHEN the component renders
- THEN display a table with columns: Monto, Estado, Fecha de solicitud, Fecha de pago, TxHash (linked to CeloScan)

### Requirement: Loading State

- GIVEN the component is mounted and credits are loading
- THEN show a loading indicator

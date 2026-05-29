# flujo-repago Specification

## Purpose

Enable borrowers to register manual cUSD repayments via on-chain transaction verification. Borrowers see their active credits and submit a transaction hash; the system verifies the on-chain transfer and transitions the credit to `pagado`.

---

## Migration 004 — `fecha_pago` column

### Requirement: Add fecha_pago to creditos

The system MUST record when a repayment was processed.

- `ALTER TABLE creditos ADD COLUMN fecha_pago TIMESTAMPTZ`
- Populated on successful payment (set to `now()`)
- No enum changes needed — `pago_recibido` already exists in `tipo_accion` (from 001_schema.sql)
- No trigger changes needed — the existing `audit_credito_estado_change()` trigger already maps `pagado` → `pago_recibido`

---

## POST /api/pago — Register Payment

### Overview

Validates that a borrower-submitted transaction hash corresponds to a legitimate cUSD repayment to the platform wallet, then transitions the credit to `pagado`.

### Request

`POST /api/pago`

Body (JSON):

```jsonc
{
  "credito_id": "uuid",  // UUID of the credit being repaid
  "tx_hash": "string"    // 0x-prefixed transaction hash on Celo
}
```

### Requirement: Input Validation

The endpoint MUST validate that `credito_id` is a well-formed UUID and `tx_hash` is a valid 0x-prefixed hex string.

- GIVEN a request with a malformed UUID or invalid tx_hash
- WHEN POST is called
- THEN response is `400` with error code `DATOS_INVALIDOS`

### Requirement: Credit Existence

The endpoint MUST reject requests for non-existent credits.

- GIVEN a `credito_id` that does not exist in the database
- WHEN POST is called
- THEN response is `404` with error code `CREDITO_NO_ENCONTRADO`

### Requirement: State Validation

The endpoint MUST only accept payments for credits in `desembolsado` state.

- GIVEN a credit in `pendiente` state
- WHEN POST is called with a valid tx_hash
- THEN response is `409` with error code `ESTADO_INCORRECTO`
- AND the credit remains unchanged

### Requirement: Duplicate Payment Prevention

The endpoint MUST prevent a credit from being paid twice.

- GIVEN a credit already in `pagado` state
- WHEN POST is called
- THEN response is `409` with error code `YA_PAGADO`

### Requirement: Transaction Hash Uniqueness

The endpoint MUST reject duplicate `tx_hash` values (already used for another credit).

- GIVEN a tx_hash that already exists on a different credit row
- WHEN POST is called
- THEN response is `409` with error code `TX_HASH_DUPLICADO`

### Requirement: On-Chain Verification

The endpoint MUST verify the transaction exists on-chain and represents a valid cUSD repayment to the platform wallet.

- GIVEN a valid `tx_hash` that corresponds to a different cUSD recipient
- WHEN POST is called
- THEN response is `422` with error code `TX_DESTINO_INVALIDO`

- GIVEN a valid `tx_hash` with amount less than the credit `monto`
- WHEN POST is called
- THEN response is `422` with error code `TX_MONTO_INSUFICIENTE`

- GIVEN a tx_hash for a transaction that was reverted on-chain
- WHEN POST is called
- THEN response is `422` with error code `TX_REVERTIDA`

- GIVEN a tx_hash that does not exist on-chain
- WHEN POST is called
- THEN response is `422` with error code `TX_NO_ENCONTRADA`

### Requirement: Successful Payment

The endpoint MUST update the credit record and return success when verification passes.

- GIVEN a credit in `desembolsado` state
- AND the borrower has sent a valid cUSD transfer to the platform wallet
- WHEN POST is called with the correct tx_hash
- THEN the credit transitions to `pagado`
- AND `fecha_pago` is set to the current timestamp
- AND the existing DB trigger records an audit log with `accion: pago_recibido`
- AND response is `200` with `{ status: "pagado", credito_id }`

### Error Codes Summary

| Status | Error Code | Condition |
|--------|-----------|-----------|
| 400 | `DATOS_INVALIDOS` | Malformed UUID or tx_hash |
| 401 | `NO_AUTENTICADO` | No valid session |
| 404 | `CREDITO_NO_ENCONTRADO` | credito_id not in DB |
| 409 | `ESTADO_INCORRECTO` | Credit not in `desembolsado` |
| 409 | `YA_PAGADO` | Credit already in `pagado` |
| 409 | `TX_HASH_DUPLICADO` | tx_hash already used for another credit |
| 422 | `TX_NO_ENCONTRADA` | Transaction not found on-chain |
| 422 | `TX_REVERTIDA` | Transaction receipt status is `reverted` |
| 422 | `TX_DESTINO_INVALIDO` | Transaction recipient is not the cUSD contract |
| 422 | `TX_MONTO_INSUFICIENTE` | Transferred amount < credit monto |
| 422 | `TX_BENEFICIARIO_INVALIDO` | Transfer destination is not the platform wallet |
| 500 | `ERROR_INTERNO` | Unexpected server error |

---

## GET /api/mis-creditos — List Borrower's Credits

### Overview

Returns all credits where the authenticated user is the `prestatario`. Uses the Supabase Auth session to identify the user and joins via `participantes.user_id`.

### Request

`GET /api/mis-creditos`

No body. Auth via Supabase session cookie.

### Requirement: Authentication

The endpoint MUST reject unauthenticated requests.

- GIVEN no valid session cookie
- WHEN GET is called
- THEN response is `401` with error code `NO_AUTENTICADO`

### Requirement: User-to-Participante Resolution

The endpoint MUST look up the `participantes` row for the authenticated `user_id`.

- GIVEN a user with no `participantes` row
- WHEN GET is called
- THEN response is `200` with an empty array `[]`

### Requirement: Credit Retrieval

The endpoint MUST return all credits where `prestatario_id` matches the user's participante ID, regardless of `estado`.

- GIVEN an authenticated user with 3 credits (across different estados)
- WHEN GET is called
- THEN response is `200` with an array of 3 credit objects
- AND each object contains all `creditos` columns: `id`, `prestatario_id`, `monto`, `descripcion`, `estado`, `tx_hash`, `fecha_solicitud`, `fecha_actualizacion`, `fecha_pago`

### Requirement: Empty List

- GIVEN an authenticated user with zero credits
- WHEN GET is called
- THEN response is `200` with an empty array `[]`

### Response Shape

```jsonc
{
  "creditos": [
    {
      "id": "uuid",
      "prestatario_id": "uuid",
      "monto": "10000000000000000000",  // string (NUMERIC from Postgres)
      "descripcion": "string | null",
      "estado": "desembolsado",         // EstadoCredito enum value
      "tx_hash": "0x... | null",
      "fecha_solicitud": "ISO timestamp",
      "fecha_actualizacion": "ISO timestamp",
      "fecha_pago": "ISO timestamp | null"
    }
  ]
}
```

---

## `verificarPago()` Helper

### Overview

Pure blockchain verification function. Takes a transaction hash and expected amount, returns whether the on-chain transaction represents a valid cUSD repayment to the platform wallet.

### Interface

- **Module**: `src/lib/blockchain/verificarPago.ts`
- **Input**: `txHash: string (0x-prefixed hex)`, `montoEsperado: bigint (in wei)`
- **Returns**: `Promise<{ valid: boolean; reason?: string }>`

### Requirement: Transaction Existence

The helper MUST verify the transaction exists on-chain.

- GIVEN a tx_hash that does not correspond to any on-chain transaction
- WHEN `verificarPago()` is called
- THEN returns `{ valid: false, reason: "TX_NO_ENCONTRADA" }`

### Requirement: Contract Address Check

The helper MUST verify the transaction is a call to the cUSD ERC-20 contract.

- GIVEN a transaction sent to any address other than the cUSD contract
- WHEN `verificarPago()` is called
- THEN returns `{ valid: false, reason: "TX_DESTINO_INVALIDO" }`

### Requirement: Beneficiary Check

The helper MUST decode the `transfer` function arguments from `tx.input` and verify the recipient is the platform wallet.

- GIVEN a cUSD `transfer` transaction to an address other than the platform wallet
- WHEN `verificarPago()` is called
- THEN returns `{ valid: false, reason: "TX_BENEFICIARIO_INVALIDO" }`

### Requirement: Amount Check

The helper MUST verify the transferred amount meets or exceeds the expected amount.

- GIVEN a cUSD `transfer` to the platform wallet for 50 cUSD
- AND the credit monto is 100 cUSD
- WHEN `verificarPago()` is called with `montoEsperado = 100 cUSD in wei`
- THEN returns `{ valid: false, reason: "TX_MONTO_INSUFICIENTE" }`

- GIVEN a cUSD `transfer` to the platform wallet for exactly 100 cUSD
- AND the credit monto is 100 cUSD
- WHEN `verificarPago()` is called
- THEN returns `{ valid: true }`

### Requirement: Receipt Confirmation

The helper MUST verify the transaction receipt confirms successful execution.

- GIVEN a transaction that was mined but reverted
- WHEN `verificarPago()` is called
- THEN returns `{ valid: false, reason: "TX_REVERTIDA" }`

### Implementation Notes

- Uses `publicClient.getTransaction(txHash)` to fetch raw transaction
- Uses `publicClient.getTransactionReceipt(txHash)` to check execution status
- Verifies `tx.to === cUSD contract address` (from `getCusdContractAddress()`)
- Decodes `tx.input` using `viem.decodeFunctionData` with the ERC-20 transfer ABI:
  - First decoded arg is `to` (recipient) — must equal platform wallet address
  - Second decoded arg is `value` (amount in wei) — must be >= expected amount
- Platform wallet address is obtained via `getAccount().address` (exported from client.ts)
- RPC timeouts MUST be handled — wrap calls with a 30-second timeout

---

## `PanelPagos.tsx` — Borrower Payment Dashboard

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

## Scenarios

### Scenario: Pago exitoso

```
GIVEN un crédito en estado "desembolsado"
AND el prestatario envía cUSD a la wallet de la plataforma
WHEN se registra el tx_hash via POST /api/pago
THEN se verifica la tx on-chain
AND el crédito pasa a estado "pagado"
AND fecha_pago se setea a la fecha actual
AND se registra audit_log con acción "pago_recibido"
AND la API responde 200 con { status: "pagado" }
AND PanelPagos remueve el crédito de la lista activa
```

### Scenario: Tx inválida (monto insuficiente)

```
GIVEN un crédito de 100 cUSD en estado "desembolsado"
WHEN se registra una tx de solo 50 cUSD hacia la plataforma
THEN la API retorna 422 con TX_MONTO_INSUFICIENTE
AND el crédito permanece en "desembolsado"
AND PanelPagos muestra "El monto enviado es menor al crédito"
```

### Scenario: Tx con destinatario incorrecto

```
GIVEN un crédito en estado "desembolsado"
WHEN se registra una tx de cUSD hacia una wallet externa (no la plataforma)
THEN la API retorna 422 con TX_BENEFICIARIO_INVALIDO
AND el crédito permanece en "desembolsado"
```

### Scenario: Tx inexistente

```
GIVEN un crédito en estado "desembolsado"
WHEN se registra un tx_hash que no existe en la blockchain
THEN la API retorna 422 con TX_NO_ENCONTRADA
AND el crédito permanece en "desembolsado"
```

### Scenario: Crédito en estado incorrecto

```
GIVEN un crédito en estado "pendiente"
WHEN se intenta registrar un pago
THEN la API retorna 409 con ESTADO_INCORRECTO
AND el crédito permanece en "pendiente"
```

### Scenario: Usuario no autenticado en GET /api/mis-creditos

```
GIVEN no hay sesión activa
WHEN se llama a GET /api/mis-creditos
THEN la API retorna 401 con NO_AUTENTICADO
```

### Scenario: Usuario sin créditos

```
GIVEN un usuario autenticado sin créditos registrados
WHEN se llama a GET /api/mis-creditos
THEN la API retorna 200 con un array vacío []
AND PanelPagos muestra "No tienes créditos activos"
```

### Scenario: Todos los créditos pagados

```
GIVEN un usuario con todos sus créditos en estado "pagado"
WHEN se llama a GET /api/mis-creditos
THEN la API retorna 200 con los créditos
AND PanelPagos filtra y muestra "No tienes pagos pendientes"
```

### Scenario: RPC timeout durante verificación

```
GIVEN un crédito en estado "desembolsado"
WHEN el RPC de Celo tarda más de 30 segundos
THEN la API retorna 500 con ERROR_INTERNO
AND el crédito permanece en "desembolsado"
AND PanelPagos muestra "Error del servidor. Intenta de nuevo más tarde"
```

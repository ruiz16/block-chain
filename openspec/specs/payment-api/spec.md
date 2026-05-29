# payment-api Specification

## Purpose

`POST /api/pago` and `GET /api/mis-creditos` endpoints — register manual cUSD repayments with on-chain transaction verification, and list the authenticated borrower's credits.

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

- GIVEN a cUSD transfer transaction to an address other than the platform wallet
- WHEN POST is called
- THEN response is `422` with error code `TX_BENEFICIARIO_INVALIDO`

### Requirement: RPC Failure Handling

The endpoint MUST handle Celo RPC failures (timeout or network error) gracefully without corrupting state.

- GIVEN a credit in `desembolsado` state
- WHEN the RPC call fails (timeout or error)
- THEN response is `500` with error code `ERROR_INTERNO`
- AND the credit remains in `desembolsado` state

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
| 500 | `ERROR_INTERNO` | RPC timeout, network error, or unexpected server error |

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
- AND each object contains all `creditos` columns: `id`, `prestatario_id`, `monto`, `descripcion`, `estado`, `tx_hash`, `fecha_solicitud`, `fecha_actualizacion`, `fecha_pago`, `tx_hash_pago`

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
      "fecha_pago": "ISO timestamp | null",
      "tx_hash_pago": "0x... | null"
    }
  ]
}
```

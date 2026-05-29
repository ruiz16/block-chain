# disbursement-api Specification

## Purpose

`POST /api/desembolso` endpoint — validates credit eligibility, executes cUSD transfer, records result.

## Requirements

### Requirement: Input Validation

The endpoint MUST validate that `credito_id` is a well-formed UUID and exists in the database.

- GIVEN a request with a malformed UUID
- WHEN POST is called
- THEN response is `400` with `error: CREDIDO_ID_INVALIDO`

### Requirement: Reputation Gate

The endpoint MUST reject disbursement if the participant's `score_reputacion ≤ 80`.

- GIVEN a participant with `score_reputacion = 70`
- WHEN POST is called for an approved credit
- THEN response is `403` with `error: SCORE_INSUFICIENTE`

### Requirement: Status Validation

The endpoint MUST reject disbursement if the credit is not in `aprobado` state.

- GIVEN a credit in `pendiente` state
- WHEN POST is called
- THEN response is `409` with `error: ESTADO_INCORRECTO`

### Requirement: Successful Disbursement

The endpoint MUST transfer cUSD, update the credit record, and return the tx_hash.

- GIVEN a valid approved credit with sufficient reputation
- WHEN POST is called
- THEN the credit transitions to `desembolsado`
- AND `tx_hash` is recorded
- AND an audit log entry is created
- AND response is `201` with `{ status: "desembolsado", tx_hash }`

### Requirement: RPC Failure Handling

The endpoint MUST handle Celo RPC failures gracefully without corrupting state.

- GIVEN a credit in `aprobado` state
- WHEN the RPC call fails (timeout or error)
- THEN response is `500` with `error: ERROR_INTERNO`
- AND an audit log with `accion: desembolso_fallo` is recorded
- AND the credit remains in `aprobado` state

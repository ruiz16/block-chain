# celo-integration Specification

## Purpose

Blockchain interaction layer: viem client setup, cUSD ERC-20 transfer, and CeloScan URL generation.

## Requirements

### Requirement: Client Factory

The system MUST provide a static factory for viem clients using the Celo Alfajores RPC endpoint.

- GIVEN a valid `CELO_RPC_URL` environment variable
- WHEN `createPublicClient` is called
- THEN a public viem client connected to Alfajores is returned

### Requirement: cUSD Transfer

The system MUST send cUSD via the ERC-20 `transfer` method on the Celo Alfajores cUSD contract.

- GIVEN a funded wallet (via `CELO_PRIVATE_KEY`)
- WHEN a transfer of `monto` cUSD is made to a `recipient_address`
- THEN the wallet client executes `contract.write.transfer([recipient_address, parsedUnits])`
- AND the transaction receipt is verified before proceeding

### Requirement: CeloScan URL

The system MUST construct a valid CeloScan transaction URL for any `tx_hash`.

- GIVEN a valid `tx_hash`
- WHEN `getCeloScanUrl(tx_hash)` is called
- THEN the result is `https://alfajores.celoscan.io/tx/{tx_hash}`

### Requirement: Payment Verification

The system MUST provide a read-only function `verificarPago()` that verifies an on-chain cUSD transfer to the platform wallet.

- GIVEN a tx_hash that does not correspond to any on-chain transaction
- WHEN `verificarPago()` is called
- THEN returns `{ valid: false, reason: "TX_NO_ENCONTRADA" }`

- GIVEN a transaction sent to any address other than the cUSD contract
- WHEN `verificarPago()` is called
- THEN returns `{ valid: false, reason: "TX_DESTINO_INVALIDO" }`

- GIVEN a cUSD `transfer` transaction to an address other than the platform wallet
- WHEN `verificarPago()` is called
- THEN returns `{ valid: false, reason: "TX_BENEFICIARIO_INVALIDO" }`

- GIVEN a cUSD `transfer` to the platform wallet for 50 cUSD
- AND the credit monto is 100 cUSD
- WHEN `verificarPago()` is called with `montoEsperado = 100 cUSD in wei`
- THEN returns `{ valid: false, reason: "TX_MONTO_INSUFICIENTE" }`

- GIVEN a transaction that was mined but reverted
- WHEN `verificarPago()` is called
- THEN returns `{ valid: false, reason: "TX_REVERTIDA" }`

- GIVEN a cUSD `transfer` to the platform wallet for exactly the expected amount
- WHEN `verificarPago()` is called
- THEN returns `{ valid: true }`

- GIVEN a Celo RPC timeout or network error
- WHEN `verificarPago()` is called
- THEN returns `{ valid: false, reason: "RPC_ERROR" }`

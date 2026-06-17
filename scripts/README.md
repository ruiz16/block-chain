# Scripts — guía rápida

Scripts organizados **por propósito** (no por red). La red la decide:
- **Hardhat**: el flag `--network` (`celoSepolia` = testnet, `celo` = mainnet). El mismo
  archivo corre en ambas redes.
- **viem standalone**: el RPC/red dentro del script (algunos están fijos a una red).

Variables de entorno (`.env.local`): en **mainnet** llevan sufijo `_MAINNET`; en
**testnet** van con el nombre plano. Ver `src/config/network.ts`.

Cómo correr:
- Hardhat → `npx hardhat run scripts/<carpeta>/<archivo> --network celoSepolia` (o `celo`)
- viem    → `node scripts/<carpeta>/<archivo>` (correr desde la raíz de `mangle-app`)

---

## deploy/ — desplegar contratos (Hardhat)

| Script | Qué hace | Red | Notas |
|---|---|---|---|
| `deploy-lending-pool.mjs` | Despliega el LendingPool (escrow) | cualquiera (`--network`) | Setea owner/disburser al firmante |
| `deploy-mock-copm.mjs` | Despliega MockCopm (token de prueba) | **solo testnet** | Token ficticio, owner = tú |
| `deploy-mock-cusd.mjs` | Despliega MockCusd (token de prueba) | **solo testnet** | Token ficticio |

## ops/ — operaciones (Hardhat)

| Script | Qué hace | Red | Notas |
|---|---|---|---|
| `fund-lending-pool.mjs` | Fondea el pool con COPm | cualquiera | **network-aware** (usa vars `_MAINNET` en mainnet). Monto: `FUND_AMOUNT=25000` |
| `fund-lending-pool-mock.mjs` | Fondea el pool con el mock | testnet | |
| `mint-copm.mjs` | Mintea COPm a una wallet | **solo testnet (mock)** | Requiere `MOCK_COPM`. Solo el owner puede |
| `mint-to-wallet.mjs` | Mintea un token a una wallet destino | testnet | Editar dirección/monto dentro |
| `send-gas.mjs` | Envía CELO (gas) a una wallet | cualquiera | |

## diagnostics/ — verificaciones de solo lectura

| Script | Qué hace | Red | Cómo |
|---|---|---|---|
| `check-owner.mjs` | ¿La llave es owner del COPm? | cualquiera | Hardhat, requiere `MOCK_COPM` |
| `check-balance.mjs` | Balance COPm de la platform wallet | testnet | viem |
| `check-balances-all.mjs` | CELO + USDm + USDC + COPm de la wallet | testnet | viem |
| `check-balances-mainnet.mjs` | CELO + USDC + USDm + COPm en `0x6C84` | **mainnet** | viem, direcciones fijas |
| `smoke-test-lending-pool.mjs` | Smoke test del pool | cualquiera | Hardhat |

## mento/ — Mento (swaps, cotizaciones, oráculo)

| Script | Qué hace | Red | Cómo |
|---|---|---|---|
| `mento-quote.mjs` | Cotiza USDm → COPm | testnet | viem + Mento SDK |
| `mento-routes.mjs` | Lista pools/rutas de Mento | testnet | viem + Mento SDK |
| `check-copm-oracle.mjs` | ¿El oráculo de COPm está vivo? (exit 0/1) | testnet | viem + Mento SDK |
| `mainnet-copm-quote.mjs` | Cuánto cuesta comprar 100k COPm | **mainnet** | viem + Mento SDK |
| `swap-usdm-to-copm.mjs` | Swap real USDm → COPm | testnet (ajustable) | viem + Mento SDK. Aborta si el oráculo está muerto |

---

## Flujos típicos

**Fondear el pool en mainnet (producción/piloto):**
```bash
node scripts/diagnostics/check-balances-mainnet.mjs        # confirmar saldo
FUND_AMOUNT=25000 npx hardhat run scripts/ops/fund-lending-pool.mjs --network celo
```

**Probar todo en testnet:**
```bash
npx hardhat run scripts/deploy/deploy-lending-pool.mjs --network celoSepolia
MOCK_COPM=0x... npx hardhat run scripts/ops/mint-copm.mjs --network celoSepolia
npx hardhat run scripts/ops/fund-lending-pool.mjs --network celoSepolia
```

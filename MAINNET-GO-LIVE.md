# 🚀 Go-Live a MAINNET — Paso a Paso

Runbook para pasar Mangle de testnet (Mock COPm) a **mainnet real**: desplegar y
fondear el LendingPool escrow, y apuntar backend + móvil a mainnet.

> **Ya hecho (Fase 1, commit `c6a41bd`, rama `feat/mainnet-deploy-config`):**
> - `hardhat.config.js`: red `celo` (42220) + Celoscan.
> - `scripts/deploy/deploy-lending-pool.mjs`: usa el COPm **real** en `--network celo`.
> Empezá en la Fase 0.

## Direcciones reales (mainnet)
| Token | Address |
|---|---|
| COPm (Mento) | `0x8A567e2aE79CA692Bd748aB832081C45de4041eA` |
| USDm (cUSD) | `0x765DE816845861e75A25fCA122bb6898B8B1282a` |
| Mento Broker | `0x777A8255cA72412f0d706dc03C9D1987306B4CaD` |

⚠️ **REGLA DE ORO:** `NEXT_PUBLIC_LENDING_POOL_CONTRACT_MAINNET` (backend) y
`VITE_LENDING_POOL_MAINNET` (móvil) deben ser **la MISMA dirección**. El móvil
toma el pool del backend (`/api/mobile/pago-config`); si no coinciden, los pagos
van al contrato equivocado.

---

## ☐ Fase 0 — Pre-requisitos (verificar ANTES)

- [ ] En `mangle-app/.env.local`:
  - `CELO_RPC_URL_MAINNET=https://forno.celo.org` (o un RPC mejor)
  - `CELO_PRIVATE_KEY_MAINNET=<tu llave de mainnet>` (¡secreta!)
- [ ] La wallet de esa llave tiene:
  - [ ] **COPm real** suficiente para el fondeo inicial (empezá chico).
  - [ ] Un poco de **CELO** para gas del deploy y del fund (esas tx pagan gas en CELO nativo).
- [ ] Definiste la wallet de plataforma: `NEXT_PUBLIC_PLATFORM_WALLET_ADDRESS=<real>`.
- [ ] Owner del pool = tu EOA (decidido). 🔒 **Migrar a multisig (Safe) antes de escalar capital.**

---

## ☐ Fase 1 — Infra de deploy ✅ (ya hecha)

Nada que hacer. Ya está en la rama `feat/mainnet-deploy-config`.
Si trabajás desde `main`, primero mergeá o cambiá a esa rama:
```bash
cd mangle-app
git checkout feat/mainnet-deploy-config
```

---

## ☐ Fase 2 — Deploy + verify + fund (EMPEZÁ CHICO)

1. [ ] **Deploy del LendingPool a mainnet:**
   ```bash
   cd mangle-app
   npx hardhat run scripts/deploy/deploy-lending-pool.mjs --network celo
   ```
   → **Copiá la dirección** que imprime. La vas a usar en Fase 3 y 4.
   (Constructor v2: owner=disburser=treasury=tu wallet, `maxDisbursement = 1.000.000 COPm`.
   Si querés otro cap, editá `maxDisbursement` en el script antes de desplegar.)

2. [ ] **(Opcional) Verificar en Celoscan** — necesitás `CELOSCAN_API_KEY` en `.env.local`:
   ```bash
   npx hardhat verify --network celo <POOL_ADDRESS> \
     0x8A567e2aE79CA692Bd748aB832081C45de4041eA <TU_WALLET> <TU_WALLET> <TU_WALLET> 1000000000000000000000000
   ```
   (args v2 = COPm, owner, disburser, treasury, maxDisbursement en wei. Ajustá si cambiaste el cap.)

3. [ ] **Fondeo inicial PEQUEÑO** (validá el flujo antes de meter capital en serio):
   ```bash
   FUND_AMOUNT=<monto_chico> npx hardhat run scripts/ops/fund-lending-pool.mjs --network celo
   ```

4. [ ] **Confirmar saldo del pool:**
   ```bash
   node scripts/diagnostics/check-balances-mainnet.mjs
   ```

---

## ☐ Fase 3 — Cutover BACKEND (`mangle-app` .env.local / Vercel)

Setear y redeployar:
- [ ] `NEXT_PUBLIC_CELO_NETWORK=mainnet`
- [ ] `NEXT_PUBLIC_LENDING_POOL_CONTRACT_MAINNET=<dirección del deploy>`
- [ ] `NEXT_PUBLIC_COPM_CONTRACT_MAINNET=0x8A567e2aE79CA692Bd748aB832081C45de4041eA` (ya en env.example)
- [ ] `NEXT_PUBLIC_PLATFORM_WALLET_ADDRESS=<real>`
- [ ] `CELO_RPC_URL_MAINNET` y `CELO_PRIVATE_KEY_MAINNET` (ya de Fase 0)
- [ ] `NEXT_PUBLIC_CELOSCAN_BASE_URL_MAINNET=https://celoscan.io`
- [ ] Supabase **prod**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`
- [ ] `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_SITE_URL` = URL de producción
- [ ] **Redeploy backend.**

> El backend ya es network-aware (`src/config/network.ts` + `assertActiveChain()`).
> El gas-subsidy de 0.01 CELO ya está gateado a testnet; en mainnet `desembolsar.ts`
> paga gas en COPm. No requiere cambios de código.

---

## ☐ Fase 4 — Cutover MÓVIL (`mangle-mobile`)

1. [ ] En `mangle-mobile/.env.local`:
   - `VITE_CELO_NETWORK=mainnet`
   - `VITE_LENDING_POOL_MAINNET=<MISMA dirección que el backend>`  ⚠️
   - `VITE_COPM_MAINNET=0x8A567e2aE79CA692Bd748aB832081C45de4041eA` (ya)
   - `VITE_CUSD_MAINNET=0x765DE816845861e75A25fCA122bb6898B8B1282a` (ya)
   - `VITE_CELO_MAINNET_RPC=<RPC mainnet>`
   - `VITE_API_URL=<URL del backend mainnet>`
2. [ ] **Mergear el repago a master** (avisame y lo hago yo, o):
   ```bash
   cd mangle-mobile && git checkout master && git merge feat/repay-with-usdm
   ```
   (En mainnet el swap USDm→COPm se activa solo.)
3. [ ] **Rebuild / redeploy del móvil** (el toggle de red es compile-time en Vite;
   un cambio de env en runtime NO basta).

---

## ☐ Verificación end-to-end (mainnet, montos MÍNIMOS)

- [ ] `GET /api/mobile/pago-config` devuelve el pool y COPm de **mainnet** (no testnet).
- [ ] **Desembolso:** crédito chico → admin desembolsa → COPm real llega a la wallet (verificá en Celoscan).
- [ ] **Repago directo (COPm):** pagás una cuota teniendo COPm → cuota `pagada`, evento `Repaid`, backend valida.
- [ ] **Repago con swap (USDm→COPm):** wallet con USDm pero COPm < cuota → "Pagar" hace la conversión + repago → cuota `pagada`. Tasa razonable (~3.435 COPm/USDm, pool 0.3%).
- [ ] **Saldo insuficiente:** sin USDm suficiente → modal "Recargá" con botón **"Recargar saldo"** (deep-link depósito MiniPay).
- [ ] **Lenguaje:** ningún texto visible dice COPm/USDm/swap/blockchain.
- [ ] El badge **"Modo prueba"** del Wallet desaparece en mainnet.

---

## 🔒 Seguridad / recordatorios
- Validá con **fondeo chico** primero. Es plata real y el contrato es **inmutable**.
- Owner = EOA: si se compromete la llave, el pool queda expuesto → **migrá a multisig** antes de escalar.
- El firmante necesita **CELO** para gas de deploy/fund (esas tx no usan feeCurrency).
- Backend y móvil → **misma** dirección de pool (regla de oro arriba).

## Rollback rápido
- Si algo sale mal en producción: poné `NEXT_PUBLIC_CELO_NETWORK` y `VITE_CELO_NETWORK`
  de vuelta a `sepolia`, redeploy/rebuild. Los fondos del pool mainnet siguen ahí
  (retirables por el owner con `withdraw()`); no se pierden por volver a testnet.

## Fuera de alcance (después del piloto)
- Migración a multisig. Simetría del desembolso (COPm→efectivo). Identidad por teléfono (ODIS).

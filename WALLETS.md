# Wallets — Entorno de Pruebas (Celo Sepolia)

> **⚠️ Todos los valores son de prueba en Celo Sepolia. No tienen valor real.**

## Red

| Propiedad | Valor |
|---|---|
| **Network Name** | Celo Sepolia |
| **Chain ID** | `11142220` |
| **RPC URL** | (definida en `CELO_RPC_URL` del `.env.local`) |
| **Currency Symbol** | `CELO` |
| **Block Explorer** | [Sepolia Celoscan](https://sepolia.celoscan.io/) |

---

## Wallets

### `WALLET_GLOBAL`

| | |
|---|---|
| **Dirección** | `0xfDF7e81A976E3c4079DA45e39f7014A4e27445f4` |
| **Rol** | Wallet de la plataforma |
| **Privada** | `CELO_PRIVATE_KEY` en `.env.local` (sin prefijo `0x`) |
| **CELO** | ~12.25 CELO (para gas de transacciones) |
| **cUSD** | ~10,969 cUSD (saldo del MockCusd) |

Es la wallet que ejecuta los desembolsos, acuña tokens, y paga el gas de cada operación on-chain.

---

### `PRESTATARIO`

| | |
|---|---|
| **Dirección** | `0x872a34f6320f8ab2394C7D0E205d83d6eEf77911` |
| **Rol** | Wallet de pruebas para un prestatario |
| **CELO** | ~1 CELO (para gas) |
| **cUSD** | ~30 cUSD (recibidos de un desembolso de prueba) |

---

## Contrato MockCusd

| Propiedad | Valor |
|---|---|
| **Dirección** | `0xb42aD227800bf1082A766Af8D2D221f43aE1e710` |
| **Tipo** | ERC-20 mintable (MockCusd) |
| **Owner** | `WALLET_GLOBAL` |
| **Total Supply** | 11,000 cUSD |
| **Explorer** | [Ver en Celoscan](https://sepolia.celoscan.io/address/0xb42aD227800bf1082A766Af8D2D221f43aE1e710) |

---

## CELO vs cUSD — Entendiendo la diferencia

| | CELO | cUSD |
|---|---|---|
| **¿Qué es?** | Moneda nativa de la red Celo (como ETH) | Token ERC-20 (contrato inteligente) |
| **¿Para qué sirve?** | Pagar **gas** (comisiones) de transacciones | Almacenar y transferir **valor** (préstamos, pagos) |
| **¿Se ve en MetaMask?** | ✅ Sí, automático al agregar la red | ❌ No, hay que **importar el token manualmente** |
| **¿Quién lo necesita?** | Todas las wallets que hacen transacciones | Prestatarios, avalistas, la plataforma |

### Analogía

> **CELO** es la nafta del auto. Sin nafta no podés mover el auto (ni siquiera para transferir cUSD).
>
> **cUSD** es la carga que lleva el auto. El contrato MockCusd es el camión que la transporta.

---

## Cómo ver los cUSD en MetaMask

1. Abrir MetaMask
2. Ir a la pestaña **Assets** (o Tokens)
3. Click en **"Import tokens"** (o **"Add token"**)
4. Pegar la dirección del contrato: `0xb42aD227800bf1082A766Af8D2D221f43aE1e710`
5. El símbolo (`cUSD`) y decimales (`18`) deberían autocompletarse
6. Click en **"Next"** → **"Import"**

A partir de ahí vas a ver el saldo de cUSD junto al de CELO.

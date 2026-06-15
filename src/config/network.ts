// =============================================================================
// Mangle Backend — Network & Contract Address Configuration
// =============================================================================
//
// Single source of truth para "en qué red de Celo estamos y cuáles son las
// direcciones de contratos allí". Espejo de mangle-mobile/src/lib/network.ts.
//
// La red se elige con NEXT_PUBLIC_CELO_NETWORK ('mainnet' | 'sepolia').
// La chain NO se hardcodea en ningún cliente viem: todos leen getActiveChain().
//
// IMPORTANTE (Next.js): solo las variables NEXT_PUBLIC_* llegan al navegador.
// Por eso los resolvers son GRANULARES — cada uno toca solo SU variable:
//   - getActiveChain / get*Address  → solo NEXT_PUBLIC_*  → seguros en cliente
//   - getRpcUrl                      → variable server-only → solo en servidor
// Resolver todo en bloque rompería los Client Components (el RPC no existe ahí).
//
// FAIL-FAST: SIN fallbacks ni defaults. Toda variable es REQUERIDA. Si falta
// una (o NEXT_PUBLIC_CELO_NETWORK tiene un valor inválido), la app LANZA al
// arrancar — preferimos romper ruidosamente que apuntar a la red equivocada.
// =============================================================================

import { celo, celoSepolia } from 'viem/chains';
import type { Chain } from 'viem';

export type CeloNetwork = 'mainnet' | 'sepolia';

const CHAINS: Record<CeloNetwork, Chain> = {
  mainnet: celo,
  sepolia: celoSepolia,
};

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// -----------------------------------------------------------------------------
// Env helpers
// -----------------------------------------------------------------------------

/** Variable requerida: lanza si no está definida o está vacía. */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.length === 0) {
    throw new Error(
      `Falta ${name} en las variables de entorno. Revisá .env.example.`,
    );
  }
  return value;
}

/** Igual que requireEnv pero rechaza la dirección cero (placeholder inválido). */
function requireAddress(name: string): `0x${string}` {
  const value = requireEnv(name);
  if (value.toLowerCase() === ZERO_ADDRESS) {
    throw new Error(
      `La dirección en ${name} es la dirección cero (placeholder sin desplegar). ` +
        'Desplegá el contrato y pegá la dirección real.',
    );
  }
  return value as `0x${string}`;
}

// -----------------------------------------------------------------------------
// Red activa — NEXT_PUBLIC_CELO_NETWORK. REQUERIDA y validada: si falta o el
// valor no es 'mainnet'|'sepolia', LANZA. Sin default.
// -----------------------------------------------------------------------------

function resolveActiveNetwork(): CeloNetwork {
  const raw = requireEnv('NEXT_PUBLIC_CELO_NETWORK');
  if (raw !== 'mainnet' && raw !== 'sepolia') {
    throw new Error(
      `NEXT_PUBLIC_CELO_NETWORK="${raw}" es inválido. Valores permitidos: 'mainnet' | 'sepolia'.`,
    );
  }
  return raw;
}

export const ACTIVE_NETWORK: CeloNetwork = resolveActiveNetwork();

// -----------------------------------------------------------------------------
// Resolvers granulares
// -----------------------------------------------------------------------------

/** Chain viem de la red activa. Solo depende de NEXT_PUBLIC_CELO_NETWORK → cliente-safe. */
export function getActiveChain(): Chain {
  return CHAINS[ACTIVE_NETWORK];
}

/** Dirección COPm de la red activa. NEXT_PUBLIC_* → cliente-safe. */
export function getCopmAddress(): `0x${string}` {
  return ACTIVE_NETWORK === 'mainnet'
    ? requireAddress('NEXT_PUBLIC_COPM_MAINNET')
    : requireAddress('NEXT_PUBLIC_COPM_SEPOLIA');
}

/** Dirección LendingPool de la red activa. NEXT_PUBLIC_* → cliente-safe. */
export function getLendingPoolAddr(): `0x${string}` {
  return ACTIVE_NETWORK === 'mainnet'
    ? requireAddress('NEXT_PUBLIC_LENDING_POOL_MAINNET')
    : requireAddress('NEXT_PUBLIC_LENDING_POOL_SEPOLIA');
}

/** RPC de la red activa. Variable SERVER-ONLY → llamar solo desde el servidor. */
export function getRpcUrl(): string {
  return ACTIVE_NETWORK === 'mainnet'
    ? requireEnv('CELO_MAINNET_RPC')
    : requireEnv('CELO_SEPOLIA_RPC');
}

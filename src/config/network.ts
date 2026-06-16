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

/** Lee una env REQUERIDA. Lanza si falta o está vacía (fail-fast). */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.length === 0) {
    throw new Error(
      `Falta ${name} en las variables de entorno. Revisá .env.example.`,
    );
  }
  return value;
}

/**
 * Devuelve el nombre de variable correcto según la red activa.
 * mainnet → `${base}_MAINNET`; sepolia → `${base}` (nombre plano).
 *
 * SOLO para variables SERVER-ONLY. Las NEXT_PUBLIC_* NO pueden resolverse así:
 * Next.js inlinea en el bundle del navegador únicamente las referencias
 * LITERALES (`process.env.NEXT_PUBLIC_X`). Un acceso dinámico `process.env[name]`
 * es invisible para su análisis estático y devuelve `undefined` en el cliente.
 * Por eso las NEXT_PUBLIC_* usan mapas con referencias literales (ver abajo).
 */
function envName(base: string): string {
  return ACTIVE_NETWORK === 'mainnet' ? `${base}_MAINNET` : base;
}

// -----------------------------------------------------------------------------
// Mapas LITERALES para variables NEXT_PUBLIC_* (cliente-safe).
//
// Cada entrada es una referencia literal `process.env.NEXT_PUBLIC_*` para que
// Next.js la inline en el bundle del navegador. NO reemplazar por accesos
// dinámicos: rompería el fail-fast en el cliente (devolverían undefined).
// -----------------------------------------------------------------------------

const PUBLIC_ENV = {
  copmContract: {
    mainnet: process.env.NEXT_PUBLIC_COPM_CONTRACT_MAINNET,
    sepolia: process.env.NEXT_PUBLIC_COPM_CONTRACT,
  },
  lendingPoolContract: {
    mainnet: process.env.NEXT_PUBLIC_LENDING_POOL_CONTRACT_MAINNET,
    sepolia: process.env.NEXT_PUBLIC_LENDING_POOL_CONTRACT,
  },
  celoScanBaseUrl: {
    mainnet: process.env.NEXT_PUBLIC_CELOSCAN_BASE_URL_MAINNET,
    sepolia: process.env.NEXT_PUBLIC_CELOSCAN_BASE_URL,
  },
} satisfies Record<string, Record<CeloNetwork, string | undefined>>;

/** Nombre humano de la variable según la red activa (para mensajes de error). */
function publicVarName(base: string): string {
  return ACTIVE_NETWORK === 'mainnet' ? `${base}_MAINNET` : base;
}

/** Lee una NEXT_PUBLIC_* de la red activa desde el mapa literal. Fail-fast. */
function requirePublicEnv(
  group: keyof typeof PUBLIC_ENV,
  base: string,
): string {
  const value = PUBLIC_ENV[group][ACTIVE_NETWORK];
  if (!value || value.length === 0) {
    throw new Error(
      `Falta ${publicVarName(base)} en las variables de entorno. Revisá .env.example.`,
    );
  }
  return value;
}

/** Igual que requirePublicEnv pero rechaza la dirección cero. */
function requirePublicAddress(
  group: keyof typeof PUBLIC_ENV,
  base: string,
): `0x${string}` {
  const value = requirePublicEnv(group, base);
  if (value.toLowerCase() === ZERO_ADDRESS) {
    throw new Error(
      `La dirección en ${publicVarName(base)} es la dirección cero (placeholder sin desplegar). ` +
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
  const raw = process.env.NEXT_PUBLIC_CELO_NETWORK;
  if (!raw || raw.length === 0) {
    throw new Error(
      `Falta NEXT_PUBLIC_CELO_NETWORK en las variables de entorno. Revisá .env.example.`,
    );
  }
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

/** Dirección COPm de la red activa. NEXT_PUBLIC_* → cliente-safe (mapa literal). */
export function getCopmAddress(): `0x${string}` {
  return requirePublicAddress('copmContract', 'NEXT_PUBLIC_COPM_CONTRACT');
}

/** Dirección LendingPool de la red activa. NEXT_PUBLIC_* → cliente-safe (mapa literal). */
export function getLendingPoolAddr(): `0x${string}` {
  return requirePublicAddress('lendingPoolContract', 'NEXT_PUBLIC_LENDING_POOL_CONTRACT');
}

/** RPC de la red activa. Variable SERVER-ONLY → llamar solo desde el servidor. */
export function getRpcUrl(): string {
  return requireEnv(envName('CELO_RPC_URL'));
}

/** Base URL del explorer de la red activa. NEXT_PUBLIC_* → cliente-safe (mapa literal). */
export function getCeloScanBaseUrl(): string {
  return requirePublicEnv('celoScanBaseUrl', 'NEXT_PUBLIC_CELOSCAN_BASE_URL');
}

/** Private key de la red activa. SECRETO server-only → nunca exponer al cliente. */
export function getCeloPrivateKey(): string {
  return requireEnv(envName('CELO_PRIVATE_KEY'));
}

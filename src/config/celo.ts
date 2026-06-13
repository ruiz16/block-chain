// =============================================================================
// Celo Network Configuration — Pure COPm
// =============================================================================
//
// ALL environment variables are REQUIRED — there are NO defaults.
// If a variable is missing, the app will throw an error at startup.
//
// Required vars (see .env.example):
//   CELO_RPC_URL                    — Celo RPC endpoint
//   NEXT_PUBLIC_COPM_CONTRACT       — COPm token contract address
//   NEXT_PUBLIC_PLATFORM_WALLET_ADDRESS — Platform wallet (receives payments)
//   NEXT_PUBLIC_CELOSCAN_BASE_URL   — Block explorer base URL
// =============================================================================

import type { Address, TxHash, Wei } from '@/types/database';

/**
 * Returns the configured Celo RPC URL.
 * Throws if CELO_RPC_URL is not set.
 */
export function getCeloRpcUrl(): string {
  const url = process.env.CELO_RPC_URL;
  if (!url) throw new Error('Falta CELO_RPC_URL en las variables de entorno');
  return url;
}

/**
 * Returns the configured COPm contract address.
 * Uses NEXT_PUBLIC_ prefix because it's needed in Client Components.
 * Throws if NEXT_PUBLIC_COPM_CONTRACT is not set.
 */
export function getCopmContractAddress(): `0x${string}` {
  const address = process.env.NEXT_PUBLIC_COPM_CONTRACT;
  if (!address) {
    throw new Error('Falta NEXT_PUBLIC_COPM_CONTRACT en las variables de entorno');
  }
  return address as `0x${string}`;
}

/**
 * Returns the configured LendingPool contract address.
 * Throws if NEXT_PUBLIC_LENDING_POOL_CONTRACT is not set.
 */
export function getLendingPoolAddress(): `0x${string}` {
  const address = process.env.NEXT_PUBLIC_LENDING_POOL_CONTRACT;
  if (!address) {
    throw new Error('Falta NEXT_PUBLIC_LENDING_POOL_CONTRACT en las variables de entorno');
  }
  return address as `0x${string}`;
}

/**
 * Returns the platform wallet address (public).
 * This is the address that receives payments — safe to expose to the frontend.
 * Throws if NEXT_PUBLIC_PLATFORM_WALLET_ADDRESS is not set.
 */
export function getPlatformWalletAddressPublic(): `0x${string}` {
  const address = process.env.NEXT_PUBLIC_PLATFORM_WALLET_ADDRESS;
  if (!address) {
    throw new Error('Falta NEXT_PUBLIC_PLATFORM_WALLET_ADDRESS en las variables de entorno');
  }
  return address as `0x${string}`;
}

/**
 * Returns the block-explorer base URL.
 * Throws if NEXT_PUBLIC_CELOSCAN_BASE_URL is not set.
 */
export function getCeloScanBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_CELOSCAN_BASE_URL;
  if (!url) {
    throw new Error(
      'Falta NEXT_PUBLIC_CELOSCAN_BASE_URL en las variables de entorno',
    );
  }
  return url;
}

/**
 * Builds a full transaction URL on the block explorer from a tx hash.
 *
 * @param txHash - The transaction hash (0x-prefixed)
 * @returns Full URL like https://celo-sepolia.blockscout.com/tx/0x...
 */
export function getCeloScanUrl(txHash: TxHash): string {
  const base = getCeloScanBaseUrl();
  return `${base}/tx/${txHash}`;
}

// =============================================================================
// Wei utilities (generic — works for any 18-decimal token)
// =============================================================================

/**
 * Parses a wei value stored in the database (NUMERIC(40,0)) to BigInt.
 *
 * @param dbValue - Value from DB numeric column (string or number)
 * @returns Wei branded type
 *
 * @example
 *   parseWeiFromDb("10000000000000000000")  // => 10000000000000000000n as Wei
 */
export function parseWeiFromDb(dbValue: string | number): Wei {
  const str = typeof dbValue === 'number' ? dbValue.toString() : dbValue;
  return BigInt(str) as Wei;
}

/**
 * Formats a Wei amount to a decimal number string.
 *
 * @param wei - Amount in wei (branded, 18 decimals)
 * @returns Decimal amount as number
 *
 * @example
 *   formatWei(10_000_000_000_000_000_000n as Wei)  // => 10
 */
export function formatWei(wei: Wei): number {
  return Number(wei) / 10 ** 18;
}

// =============================================================================
// Celo Network Configuration
// =============================================================================
//
// ALL environment variables are REQUIRED — there are NO defaults.
// If a variable is missing, the app will throw an error at startup.
//
// Required vars (see .env.example):
//   CELO_RPC_URL                 — Celo RPC endpoint
//   CELO_CUSD_CONTRACT           — cUSD token contract address
//   NEXT_PUBLIC_CELOSCAN_BASE_URL — Block explorer base URL
//   NEXT_PUBLIC_COP_USD_RATE     — Exchange rate (COP per 1 cUSD)
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
 * Returns the configured cUSD contract address.
 * Throws if CELO_CUSD_CONTRACT is not set.
 */
export function getCusdContractAddress(): `0x${string}` {
  const address = process.env.CELO_CUSD_CONTRACT;
  if (!address) {
    throw new Error('Falta CELO_CUSD_CONTRACT en las variables de entorno');
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

/**
 * Parses a decimal cUSD amount to Wei (18 decimals).
 *
 * Uses string manipulation to avoid floating-point precision loss
 * when multiplying by 10^18 (beyond Number.MAX_SAFE_INTEGER).
 *
 * @param amount - Decimal cUSD amount as number or string (e.g., 10.50 for 10.50 cUSD)
 * @returns Wei branded type
 *
 * @example
 *   parseCusd("10")           // => 10_000_000_000_000_000_000n as Wei
 *   parseCusd("10.50")        // => 10_500_000_000_000_000_000n as Wei
 *   parseCusd(0.5)            // => 500_000_000_000_000_000n as Wei
 */
export function parseCusd(amount: number | string): Wei {
  const str = typeof amount === 'number' ? amount.toString() : amount;
  const [integerPart = '0', decimalPart = ''] = str.split('.');
  const paddedDecimals = decimalPart.padEnd(18, '0').slice(0, 18);
  const wei = BigInt(`${integerPart}${paddedDecimals}`);
  return wei as Wei;
}

/**
 * Parses a wei value stored in the database (NUMERIC(40,0)) to BigInt.
 *
 * Handles both integer strings ("10000000000000000000") and decimal strings
 * that may come from Supabase numeric serialization.
 *
 * IMPORTANT: Supabase returns NUMERIC columns as `number` in some versions.
 * This function normalizes to string first to avoid `.includes()` on numbers.
 *
 * @param dbValue - Value from DB numeric column (string or number)
 * @returns Wei branded type
 *
 * @example
 *   parseWeiFromDb("10000000000000000000")  // => 10000000000000000000n as Wei
 *   parseWeiFromDb(100)                     // => 10000000000000000000n as Wei
 *   parseWeiFromDb("10.50")                 // => 10500000000000000000n as Wei (converted as cUSD)
 */
export function parseWeiFromDb(dbValue: string | number): Wei {
  // Normalize to string — Supabase can return NUMERIC as number
  const str = typeof dbValue === 'number' ? dbValue.toString() : dbValue;

  // If it looks like a decimal (cUSD format), parse as cUSD
  if (str.includes('.')) {
    return parseCusd(str);
  }
  // Otherwise it's already in wei (integer)
  return BigInt(str) as Wei;
}

/**
 * Formats a Wei amount to decimal cUSD.
 *
 * @param wei - Amount in wei (branded)
 * @returns Decimal cUSD amount
 *
 * @example
 *   formatCusd(10_000_000_000_000_000_000n as Wei)  // => 10
 */
export function formatCusd(wei: Wei): number {
  return Number(wei) / 10 ** 18;
}

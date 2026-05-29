// =============================================================================
// Celo Alfajores Network Configuration
// =============================================================================

import type { Address, TxHash, Wei } from '@/types/database';

/** Celo Alfajores chain ID */
export const CELO_CHAIN_ID = 44787;

/** Default RPC URL for Celo Alfajores Forno */
export const DEFAULT_CELO_RPC_URL =
  'https://alfajores-forno.celo-testnet.org';

/** Default cUSD contract address on Celo Alfajores */
export const DEFAULT_CUSD_CONTRACT =
  '0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1';

/**
 * Returns the configured Celo RPC URL from environment or default.
 */
export function getCeloRpcUrl(): string {
  return process.env.CELO_RPC_URL ?? DEFAULT_CELO_RPC_URL;
}

/**
 * Returns the configured cUSD contract address from environment or default.
 */
export function getCusdContractAddress(): `0x${string}` {
  return (
    (process.env.CELO_CUSD_CONTRACT as `0x${string}` | undefined) ??
    DEFAULT_CUSD_CONTRACT
  );
}

/**
 * Returns the CeloScan base URL from environment or default.
 */
export function getCeloScanBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_CELOSCAN_BASE_URL ??
    'https://alfajores.celoscan.io'
  );
}

/**
 * Builds a full CeloScan transaction URL from a tx hash.
 *
 * @param txHash - The transaction hash (0x-prefixed)
 * @returns Full URL like https://alfajores.celoscan.io/tx/0x...
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
 * @param dbValue - String from DB numeric column
 * @returns Wei branded type
 *
 * @example
 *   parseWeiFromDb("10000000000000000000")  // => 10000000000000000000n as Wei
 *   parseWeiFromDb("10.50")                 // => 10500000000000000000n as Wei (converted as cUSD)
 */
export function parseWeiFromDb(dbValue: string): Wei {
  // If it looks like a decimal (cUSD format), parse as cUSD
  if (dbValue.includes('.')) {
    return parseCusd(dbValue);
  }
  // Otherwise it's already in wei (integer)
  return BigInt(dbValue) as Wei;
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

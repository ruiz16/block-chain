// =============================================================================
// Celo Network Configuration
// =============================================================================
//
// Celo Alfajores (testnet, chain 44787) has been DEPRECATED as of 2025.
// The new testnet is Celo Sepolia (chain 11142220).
//
// References:
//   - https://docs.celo.org/build-on-celo/network-overview
//   - https://faucet.celo.org/celo-sepolia  (CELO test tokens)
//   - https://celo-sepolia.blockscout.com  (block explorer)
// =============================================================================

import type { Address, TxHash, Wei } from '@/types/database';

/** Celo Sepolia chain ID (replaces deprecated Alfajores) */
export const CELO_CHAIN_ID = 11142220;

/** Default RPC URL for Celo Sepolia */
export const DEFAULT_CELO_RPC_URL =
  'https://forno.celo-sepolia.celo-testnet.org';

/** Default cUSD contract address on Celo Sepolia */
export const DEFAULT_CUSD_CONTRACT =
  '0xEF4d55D6dE8e8d73232827Cd1e9b2F2dBb45bC80';

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
 * Returns the block-explorer base URL from environment or default.
 *
 * Defaults to Celo Sepolia Blockscout (replaces deprecated Celoscan).
 */
export function getCeloScanBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_CELOSCAN_BASE_URL ??
    'https://celo-sepolia.blockscout.com'
  );
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

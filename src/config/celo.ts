// =============================================================================
// Celo Network Configuration
// =============================================================================
//
// ALL environment variables are REQUIRED — there are NO defaults.
// If a variable is missing, the app will throw an error at startup.
//
// Required vars (see .env.example):
//   CELO_RPC_URL                        — Celo RPC endpoint
//   NEXT_PUBLIC_CELO_COPM_CONTRACT      — COPm token contract address (Mento Colombian Peso)
//   NEXT_PUBLIC_CELO_COPM_TESTNET       — COPm testnet contract address (Celo Sepolia)
//   NEXT_PUBLIC_CELOSCAN_BASE_URL       — Block explorer base URL
//
// Legacy (being removed):
//   NEXT_PUBLIC_CELO_CUSD_CONTRACT      — cUSD token contract (deprecated, use COPm)
//   NEXT_PUBLIC_COP_USD_RATE            — Exchange rate (deprecated, COPm = COP 1:1)
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
 * Returns the configured COPm (Mento Colombian Peso) contract address for mainnet.
 * Uses NEXT_PUBLIC_ prefix because it's needed in Client Components (PanelPagos).
 * Throws if NEXT_PUBLIC_CELO_COPM_CONTRACT is not set.
 *
 * COPm = Mento Colombian Peso stablecoin, pegged 1:1 to COP.
 * https://docs.mento.org/mento-v3/
 *
 * Mainnet address: 0x8a567e2ae79ca692bd748ab832081c45de4041ea
 */
export function getCopmContractAddress(): `0x${string}` {
  const address = process.env.NEXT_PUBLIC_CELO_COPM_CONTRACT;
  if (!address) {
    throw new Error('Falta NEXT_PUBLIC_CELO_COPM_CONTRACT en las variables de entorno');
  }
  return address as `0x${string}`;
}

/**
 * Returns the COPm testnet contract address for Celo Sepolia.
 * Uses NEXT_PUBLIC_ prefix because it's needed in Client Components.
 * Falls back to the known testnet address if env var is not set.
 *
 * Testnet address: 0x5F8d55c3627d2dc0a2B4afa798f877242F382F67
 */
export function getCopmTestnetAddress(): `0x${string}` {
  const address = process.env.NEXT_PUBLIC_CELO_COPM_TESTNET;
  if (address) return address as `0x${string}`;
  // Default known COPm testnet address
  return '0x5F8d55c3627d2dc0a2B4afa798f877242F382F67' as `0x${string}`;
}

/**
 * Returns the configured cUSD contract address (LEGACY).
 * @deprecated Use getCopmContractAddress() instead — migrating from cUSD to COPm.
 */
export function getCusdContractAddress(): `0x${string}` {
  const address = process.env.NEXT_PUBLIC_CELO_CUSD_CONTRACT;
  if (!address) {
    throw new Error('Falta NEXT_PUBLIC_CELO_CUSD_CONTRACT en las variables de entorno');
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

/**
 * Parses a decimal token amount to Wei (18 decimals).
 *
 * Works for any 18-decimal ERC-20 token (COPm, cUSD, etc.).
 * Uses string manipulation to avoid floating-point precision loss.
 *
 * @param amount - Decimal amount as number or string (e.g., "10.50" for 10.50 COPm)
 * @returns Wei branded type
 *
 * @example
 *   parseTokenAmount("10")      // => 10_000_000_000_000_000_000n as Wei
 *   parseTokenAmount("10.50")   // => 10_500_000_000_000_000_000n as Wei
 *   parseTokenAmount(0.5)       // => 500_000_000_000_000_000n as Wei
 */
export function parseTokenAmount(amount: number | string): Wei {
  const str = typeof amount === 'number' ? amount.toString() : amount;
  const [integerPart = '0', decimalPart = ''] = str.split('.');
  const paddedDecimals = decimalPart.padEnd(18, '0').slice(0, 18);
  const wei = BigInt(`${integerPart}${paddedDecimals}`);
  return wei as Wei;
}

/**
 * @deprecated Use parseTokenAmount() instead.
 * Alias for backward compatibility during COPm migration.
 */
export const parseCusd = parseTokenAmount;

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
 * Formats a Wei amount to decimal token units (works for COPm, cUSD, etc.).
 *
 * @param wei - Amount in wei (branded)
 * @returns Decimal token amount
 *
 * @example
 *   formatTokenAmount(10_000_000_000_000_000_000n as Wei)  // => 10
 */
export function formatTokenAmount(wei: Wei): number {
  return Number(wei) / 10 ** 18;
}

/** @deprecated Use formatTokenAmount() instead. */
export const formatCusd = formatTokenAmount;

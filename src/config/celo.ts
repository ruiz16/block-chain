// =============================================================================
// Celo Network Configuration — Pure COPm
// =============================================================================
//
// ALL environment variables are REQUIRED — there are NO defaults.
// If a variable is missing, the app will throw an error at startup.
//
// Required vars (see .env.example):
//   CELO_RPC_URL                        — Celo RPC endpoint
//   NEXT_PUBLIC_COPM_CONTRACT           — COPm token contract address (Mento Colombian Peso)
//   NEXT_PUBLIC_PLATFORM_WALLET_ADDRESS — Platform wallet (receives payments)
//   NEXT_PUBLIC_LENDING_POOL_CONTRACT   — LendingPool contract address
//   NEXT_PUBLIC_CELOSCAN_BASE_URL       — Block explorer base URL
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
 * Returns the configured COPm (Mento Colombian Peso) contract address.
 * Uses NEXT_PUBLIC_ prefix because it's needed in Client Components (PanelPagos).
 * Throws if NEXT_PUBLIC_COPM_CONTRACT is not set.
 *
 * COPm = Mento Colombian Peso stablecoin, pegged 1:1 to COP.
 * https://docs.mento.org/mento-v3/
 */
export function getCopmContractAddress(): `0x${string}` {
  const address = process.env.NEXT_PUBLIC_COPM_CONTRACT;
  if (!address) {
    throw new Error('Falta NEXT_PUBLIC_COPM_CONTRACT en las variables de entorno');
  }
  return address as `0x${string}`;
}

/**
 * Returns the COPm testnet contract address for Celo Sepolia.
 * Falls back to the known testnet address if env var is not set.
 */
export function getCopmTestnetAddress(): `0x${string}` {
  const address = process.env.NEXT_PUBLIC_CELO_COPM_TESTNET;
  if (address) return address as `0x${string}`;
  return '0x5F8d55c3627d2dc0a2B4afa798f877242F382F67' as `0x${string}`;
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

/**
 * Builds a full address URL on the block explorer from a wallet address.
 *
 * @param address - The wallet address (0x-prefixed)
 * @returns Full URL like https://celo-sepolia.blockscout.com/address/0x...
 */
export function getCeloScanAddressUrl(address: Address): string {
  const base = getCeloScanBaseUrl();
  return `${base}/address/${address}`;
}

// =============================================================================
// Wei utilities (generic — works for any 18-decimal token)
// =============================================================================

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

/** @deprecated Use parseTokenAmount() instead. */
export const parseCusd = parseTokenAmount;

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

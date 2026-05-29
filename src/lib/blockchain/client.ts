// =============================================================================
// Viem Singleton Clients — Celo Alfajores
// =============================================================================
//
// This module creates and exports singleton viem clients for interacting
// with the Celo Alfajores testnet.
//
// The private key (CELO_PRIVATE_KEY) is loaded from environment variables
// and is NEVER logged, stringified, or exposed outside this module.
// =============================================================================

import { createPublicClient, createWalletClient, http } from 'viem';
import { celoAlfajores } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { getCeloRpcUrl } from '@/config/celo';

// Module-level cache — singleton pattern.

let publicClient: any = null;

let walletClient: any = null;

let account: any = null;

/**
 * Returns a singleton public (read-only) viem client for Celo Alfajores.
 */
export function getPublicClient() {
  if (publicClient) return publicClient as ReturnType<typeof createPublicClient>;

  publicClient = createPublicClient({
    chain: celoAlfajores,
    transport: http(getCeloRpcUrl()),
  });

  return publicClient as ReturnType<typeof createPublicClient>;
}

/**
 * Returns a singleton wallet (write-capable) viem client for Celo Alfajores.
 * The private key is derived from CELO_PRIVATE_KEY env var.
 *
 * Throws if CELO_PRIVATE_KEY is not set.
 */
export function getWalletClient() {
  if (walletClient) return walletClient as ReturnType<typeof createWalletClient>;

  const privateKey = process.env.CELO_PRIVATE_KEY;

  if (!privateKey) {
    throw new Error(
      'Falta CELO_PRIVATE_KEY en las variables de entorno. ' +
        'Configúrala en .env.local',
    );
  }

  const acc = privateKeyToAccount(privateKey as `0x${string}`);
  account = acc;

  walletClient = createWalletClient({
    chain: celoAlfajores,
    transport: http(getCeloRpcUrl()),
    account: acc,
  });

  return walletClient as ReturnType<typeof createWalletClient>;
}

/**
 * Returns the Account derived from CELO_PRIVATE_KEY.
 * Must call getWalletClient() first to initialize the account.
 */
export function getAccount() {
  if (!account) {
    // Initialize wallet client to populate account
    getWalletClient();
  }

  if (!account) {
    throw new Error('No se pudo inicializar la cuenta de Celo');
  }

  return account as ReturnType<typeof privateKeyToAccount>;
}

/**
 * Returns the platform wallet address (derived from CELO_PRIVATE_KEY).
 * Used for verifying cUSD payment recipients in the repayment flow.
 */
export function getPlatformWalletAddress(): `0x${string}` {
  return getAccount().address;
}

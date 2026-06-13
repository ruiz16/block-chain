// =============================================================================
// Viem Singleton Clients — Celo Sepolia
// =============================================================================
//
// This module creates and exports singleton viem clients for interacting
// with the Celo Sepolia testnet (replaces deprecated Celo Alfajores).
//
// The private key (CELO_PRIVATE_KEY) is loaded from environment variables
// and is NEVER logged, stringified, or exposed outside this module.
// =============================================================================

import { createPublicClient, createWalletClient, http } from 'viem';
import { celoSepolia } from 'viem/chains';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { getCeloRpcUrl } from '@/config/celo';

// Module-level cache — singleton pattern.
// Types use ReturnType<typeof fn> to stay in sync with whatever viem exports.

type PublicClientType = ReturnType<typeof createPublicClient>;
type WalletClientType = ReturnType<typeof createWalletClient>;

let publicClient: PublicClientType | null = null;

let walletClient: WalletClientType | null = null;

let account: PrivateKeyAccount | null = null;

/**
 * Returns a singleton public (read-only) viem client for Celo Sepolia.
 */
export function getPublicClient(): PublicClientType {
  if (publicClient) return publicClient;

  publicClient = createPublicClient({
    chain: celoSepolia,
    transport: http(getCeloRpcUrl()),
  }) as PublicClientType;

  return publicClient;
}

/**
 * Returns a singleton wallet (write-capable) viem client for Celo Sepolia.
 * The private key is derived from CELO_PRIVATE_KEY env var.
 *
 * Throws if CELO_PRIVATE_KEY is not set.
 */
export function getWalletClient(): WalletClientType {
  if (walletClient) return walletClient;

  const rawKey = process.env.CELO_PRIVATE_KEY;

  if (!rawKey) {
    throw new Error(
      'Falta CELO_PRIVATE_KEY en las variables de entorno. ' +
        'Configúrala en .env.local',
    );
  }

  // Normalize: add 0x prefix if missing (MetaMask exports without it)
  const privateKey = rawKey.startsWith('0x') ? (rawKey as `0x${string}`) : (`0x${rawKey}` as `0x${string}`);

  const acc = privateKeyToAccount(privateKey);
  account = acc;

  walletClient = createWalletClient({
    chain: celoSepolia,
    transport: http(getCeloRpcUrl()),
    account: acc,
  });

  return walletClient;
}

/**
 * Returns the Account derived from CELO_PRIVATE_KEY.
 * Must call getWalletClient() first to initialize the account.
 */
export function getAccount(): PrivateKeyAccount {
  if (!account) {
    // Initialize wallet client to populate account
    getWalletClient();
  }

  if (!account) {
    throw new Error('No se pudo inicializar la cuenta de Celo');
  }

  return account;
}

/**
 * Returns the platform wallet address (derived from CELO_PRIVATE_KEY).
 * Used for verifying COPm payment recipients in the repayment flow.
 */
export function getPlatformWalletAddress(): `0x${string}` {
  return getAccount().address;
}

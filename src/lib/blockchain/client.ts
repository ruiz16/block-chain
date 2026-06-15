// =============================================================================
// Viem Singleton Clients — red activa según NEXT_PUBLIC_CELO_NETWORK
// =============================================================================
//
// La chain ya NO está hardcodeada: se resuelve con getActiveChain() desde
// config/network.ts. Antes de FIRMAR cualquier transacción, assertActiveChain()
// verifica que el chainId real del RPC coincide con la red esperada — falla
// cerrado si no coinciden (evita firmar en la red equivocada con fondos reales).
//
// The private key (CELO_PRIVATE_KEY) is loaded from environment variables
// and is NEVER logged, stringified, or exposed outside this module.
// =============================================================================

import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { getCeloRpcUrl } from '@/config/celo';
import { getActiveChain } from '@/config/network';

type PublicClientType = ReturnType<typeof createPublicClient>;
type WalletClientType = ReturnType<typeof createWalletClient>;

let publicClient: PublicClientType | null = null;
let walletClient: WalletClientType | null = null;
let account: PrivateKeyAccount | null = null;
let chainAsserted = false;

/**
 * Returns a singleton public (read-only) viem client for the ACTIVE network.
 */
export function getPublicClient(): PublicClientType {
  if (publicClient) return publicClient;

  publicClient = createPublicClient({
    chain: getActiveChain(),
    transport: http(getCeloRpcUrl()),
  }) as PublicClientType;

  return publicClient;
}

/**
 * GUARD — verifica que el RPC apunta a la red esperada ANTES de firmar.
 *
 * El chainId configurado (getActiveChain().id) debe coincidir con el chainId
 * REAL que reporta el RPC. Si NEXT_PUBLIC_CELO_NETWORK dice 'mainnet' pero el
 * RPC es de Sepolia (o viceversa), esto lanza y NO se firma nada.
 *
 * Memoizado: solo consulta el RPC la primera vez. Llamar al inicio de todo
 * flujo que escriba on-chain (desembolso, barrido de intereses, etc.).
 *
 * @throws Error si el chainId del RPC no coincide con la red configurada.
 */
export async function assertActiveChain(): Promise<void> {
  if (chainAsserted) return;

  const expected = getActiveChain();
  const actual = await getPublicClient().getChainId();

  if (actual !== expected.id) {
    throw new Error(
      `Mismatch de red: NEXT_PUBLIC_CELO_NETWORK espera ${expected.name} ` +
        `(chainId ${expected.id}) pero el RPC reporta chainId ${actual}. ` +
        'Revisá CELO_MAINNET_RPC / CELO_SEPOLIA_RPC. NO se firmará ninguna transacción.',
    );
  }

  chainAsserted = true;
}

/**
 * Returns a singleton wallet (write-capable) viem client for the ACTIVE network.
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
    chain: getActiveChain(),
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

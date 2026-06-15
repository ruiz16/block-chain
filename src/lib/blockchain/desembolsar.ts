// =============================================================================
// desembolsarCredito — Core Blockchain Disbursement via LendingPool
// =============================================================================
//
// Orchestrates the full on-chain COPm disbursement through LendingPool:
//   1. Simulate (pre-flight check via LendingPool.disburse)
//   2. Execute (write contract via LendingPool)
//   3. Wait for receipt
//   4. Verify receipt status
//   5. Return TxHash
// =============================================================================

import { getPublicClient, getWalletClient, assertActiveChain } from '@/lib/blockchain/client';
import { getLendingPoolAddress } from '@/config/celo';
import { LENDING_POOL_ABI } from '@/lib/blockchain/abis/lendingPool';
import { creditIdHash } from '@/lib/blockchain/credit-id';
import type { Address, TxHash, Wei } from '@/types/database';

export class BlockchainError extends Error {
  public readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'BlockchainError';
    this.code = code;
  }
}

/**
 * Desembolsa un crédito a través del LendingPool.
 *
 * @param creditoId - UUID del crédito (se convierte a bytes32 on-chain)
 * @param to        - Wallet del prestatario
 * @param monto     - Monto en wei
 * @returns Hash de la transacción
 *
 * @throws {BlockchainError} SIMULATION_FAILED | TX_REVERTED | TX_TIMEOUT
 */
export async function desembolsarCredito(
  creditoId: string,
  to: Address,
  monto: Wei,
): Promise<TxHash> {
  // GUARD: aborta si el RPC no está en la red esperada (antes de firmar fondos).
  await assertActiveChain();

  const publicClient = getPublicClient();
  const walletClient = getWalletClient();
  const poolAddress = getLendingPoolAddress();
  const creditId = creditIdHash(creditoId);

  // 1. Simular (pre-flight). NO atrapamos el error: el route lo necesita.
  const { request } = await publicClient.simulateContract({
    address: poolAddress,
    abi: LENDING_POOL_ABI,
    functionName: 'disburse',
    args: [creditId, to as `0x${string}`, monto as bigint],
    account: walletClient.account!,
  });

  // 2. Ejecutar
  const txHash = await walletClient.writeContract(request);

  // 3. Esperar recibo
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
    timeout: 60_000,
  });

  // 4. Verificar estado
  if (receipt.status === 'reverted') {
    throw new BlockchainError(
      'TX_REVERTED',
      `La transacción ${txHash} fue revertida en la blockchain`,
    );
  }

  return txHash as TxHash;
}

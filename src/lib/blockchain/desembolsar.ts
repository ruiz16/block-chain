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
import { getLendingPoolAddress, getCopmContractAddress } from '@/config/celo';
import { LENDING_POOL_ABI } from '@/lib/blockchain/abis/lendingPool';
import { creditIdHash } from '@/lib/blockchain/credit-id';
import { ACTIVE_NETWORK } from '@/config/network';
import type { Address, TxHash, Wei } from '@/types/database';
import { parseEther } from 'viem';

// Subsidio de gas (CELO nativo) que se envía al prestatario en testnet para
// que pueda pagar el gas de sus cuotas. El COPm mock NO está whitelisteado como
// fee currency, así que sin esto un prestatario sin CELO quedaría atrapado.
const GAS_SUBSIDY_CELO = '0.01';

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

  // 0. feeCurrency para el PROPIO disburse: cómo paga gas LA WALLET DE PLATAFORMA.
  //    Mainnet: COPm oficial (sí whitelisteado como fee currency).
  //    Testnet: OMITIR → gas en CELO nativo. El COPm mock no es fee currency, e
  //    incluir un fee currency no whitelisteado haría rechazar la tx (ver PanelPagos).
  const disburseFeeField =
    ACTIVE_NETWORK === 'mainnet'
      ? { feeCurrency: getCopmContractAddress() }
      : {};

  // 1. Simular (pre-flight). NO atrapamos el error: el route lo necesita.
  const { request } = await publicClient.simulateContract({
    address: poolAddress,
    abi: LENDING_POOL_ABI,
    functionName: 'disburse',
    args: [creditId, to as `0x${string}`, monto as bigint],
    account: walletClient.account!,
    ...disburseFeeField,
  });

  // 2. Ejecutar desembolso
  const txHash = await walletClient.writeContract(request);

  // 3. Esperar recibo del desembolso
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

  // 5. Subsidio de gas (SOLO testnet, y SOLO si el desembolso fue exitoso).
  //    Enviamos CELO nativo para que el prestatario pueda pagar el gas de sus
  //    cuotas (approve + repay). En mainnet no hace falta: el COPm oficial ya es
  //    fee currency, así que paga el gas con su propio saldo. Va DESPUÉS del
  //    recibo para no gastar el subsidio si el desembolso revierte, y para evitar
  //    colisión de nonce con dos txs en vuelo desde la misma wallet.
  if (ACTIVE_NETWORK !== 'mainnet') {
    try {
      const gasTx = await walletClient.sendTransaction({
        to,
        value: parseEther(GAS_SUBSIDY_CELO),
        account: walletClient.account!,
        chain: publicClient.chain,
      });
      console.log(`[desembolsar] Subsidio de gas (CELO nativo) enviado al prestatario: ${gasTx}`);
    } catch (gasErr) {
      // No lanzamos: el desembolso ya está confirmado; el subsidio es best-effort.
      console.warn('[desembolsar] No se pudo enviar subsidio de gas al prestatario:', gasErr);
    }
  }

  return txHash as TxHash;
}

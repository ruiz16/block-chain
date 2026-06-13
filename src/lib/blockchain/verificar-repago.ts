// =============================================================================
// verificarRepago — verificación on-chain de un repago vía LendingPool
// =============================================================================
//
// A diferencia de verificarPago (Transfer ERC-20 a la platform wallet), aquí
// la tx llama LendingPool.repay() y emite el evento Repaid. Verificamos:
//   1. tx.to === LendingPool            (TX_DESTINO_INVALIDO)
//   2. receipt.status === 'success'     (TX_REVERTIDA)
//   3. existe un log Repaid del pool con creditId == hash esperado
//   4. amount del evento >= monto esperado (TX_MONTO_INSUFICIENTE)
// =============================================================================

import { decodeEventLog } from 'viem';
import { getPublicClient } from '@/lib/blockchain/client';
import { getLendingPoolAddress } from '@/config/celo';
import { LENDING_POOL_ABI, REPAID_EVENT_SIGNATURE } from '@/lib/blockchain/abis/lendingPool';
import { creditIdHash } from '@/lib/blockchain/credit-id';
import type { VerificationResult } from '@/types/database';

// =============================================================================
// Result factory helpers
// =============================================================================

function success(): VerificationResult {
  return { valid: true };
}

function failure(reason: string): VerificationResult {
  return { valid: false, reason };
}

// =============================================================================
// RPC Timeout Helper
// =============================================================================

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`RPC timeout after ${ms}ms`)), ms),
    ),
  ]);
}

// =============================================================================
// Main Verification Function
// =============================================================================

/**
 * Verifica que una tx represente un repago válido del crédito `creditoId`.
 *
 * Flow:
 * 1. Fetch transaction & receipt via publicClient
 * 2. Verify tx.to === LendingPool contract address (TX_DESTINO_INVALIDO)
 * 3. Verify receipt.status === 'success' (TX_REVERTIDA)
 * 4. Find Repaid event in receipt logs matching poolAddress
 * 5. Decode event → verify creditId matches expected hash (TX_BENEFICIARIO_INVALIDO)
 * 6. Verify amount >= montoEsperado (TX_MONTO_INSUFICIENTE)
 *
 * @param txHash         - Hash de la transacción de repago (0x-prefixed)
 * @param creditoId      - UUID del crédito (se deriva el bytes32 on-chain)
 * @param montoEsperado  - Monto mínimo esperado en wei (bigint)
 * @returns VerificationResult — `{ valid: true }` or `{ valid: false, reason }`
 *
 * Error codes:
 * - TX_NO_ENCONTRADA: Transaction not found on-chain
 * - TX_REVERTIDA: Transaction receipt status is 'reverted'
 * - TX_DESTINO_INVALIDO: Transaction is not to the LendingPool contract / no Repaid log
 * - TX_BENEFICIARIO_INVALIDO: creditId in event does not match expected hash
 * - TX_MONTO_INSUFICIENTE: Repaid amount is less than expected
 * - RPC_ERROR: RPC timeout or network error during verification
 */
export async function verificarRepago(
  txHash: `0x${string}`,
  creditoId: string,
  montoEsperado: bigint,
): Promise<VerificationResult> {
  const publicClient = getPublicClient();
  const poolAddress = getLendingPoolAddress();
  const expectedCreditId = creditIdHash(creditoId);

  // ------------------------------------------------------------------
  // 1. Fetch transaction & receipt (with 30s timeout)
  // ------------------------------------------------------------------
  let tx;
  let receipt;

  try {
    [tx, receipt] = await withTimeout(
      Promise.all([
        publicClient.getTransaction({ hash: txHash }),
        publicClient.getTransactionReceipt({ hash: txHash }),
      ]),
      30_000,
    );
  } catch (err) {
    if (err instanceof Error && err.message.includes('RPC timeout')) {
      return failure('RPC_ERROR');
    }
    return failure('TX_NO_ENCONTRADA');
  }

  // ------------------------------------------------------------------
  // 2. Verify tx.to === LendingPool contract address
  // ------------------------------------------------------------------
  if (!tx.to || tx.to.toLowerCase() !== poolAddress.toLowerCase()) {
    return failure('TX_DESTINO_INVALIDO');
  }

  // ------------------------------------------------------------------
  // 3. Verify receipt status === 'success'
  // ------------------------------------------------------------------
  if (receipt.status !== 'success') {
    return failure('TX_REVERTIDA');
  }

  // ------------------------------------------------------------------
  // 4. Find the Repaid event log emitted by the LendingPool
  // ------------------------------------------------------------------
  const repaidLog = receipt.logs.find((log: { address: string; topics?: string[] | null }) => {
    if (log.address.toLowerCase() !== poolAddress.toLowerCase()) return false;
    if (!log.topics?.[0]) return false;
    return log.topics[0].toLowerCase() === REPAID_EVENT_SIGNATURE.toLowerCase();
  });

  if (!repaidLog) {
    return failure('TX_DESTINO_INVALIDO');
  }

  // ------------------------------------------------------------------
  // 5-6. Decode Repaid event → verify creditId & amount
  // ------------------------------------------------------------------
  let decoded: { args: { creditId: `0x${string}`; payer: `0x${string}`; amount: bigint; totalRepaid: bigint } };

  try {
    const result = decodeEventLog({
      abi: LENDING_POOL_ABI,
      eventName: 'Repaid',
      data: repaidLog.data,
      topics: repaidLog.topics as [`0x${string}`, ...`0x${string}`[]],
    });
    decoded = result as typeof decoded;
  } catch {
    return failure('TX_DESTINO_INVALIDO');
  }

  // Verify creditId matches the expected hash for this credit
  if (decoded.args.creditId.toLowerCase() !== expectedCreditId.toLowerCase()) {
    return failure('TX_BENEFICIARIO_INVALIDO');
  }

  // Verify amount >= expected
  if (decoded.args.amount < montoEsperado) {
    return failure('TX_MONTO_INSUFICIENTE');
  }

  return success();
}

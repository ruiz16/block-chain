// =============================================================================
// verificarPago — On-Chain cUSD Payment Verification (Read-Only)
// =============================================================================
//
// Pure blockchain verification function. Takes a transaction hash and expected
// amount, verifies the on-chain transaction represents a valid cUSD repayment
// to the platform wallet.
//
// CRITICAL: For ERC-20 cUSD transfers, the transaction `to` is the cUSD
// contract, NOT the platform wallet. We must parse `Transfer` event logs
// from the receipt to find the actual recipient and amount.
// =============================================================================

import { decodeEventLog } from 'viem';
import { getPublicClient, getPlatformWalletAddress } from '@/lib/blockchain/client';
import { getCusdContractAddress } from '@/config/celo';
import type { VerificationResult } from '@/types/database';

// =============================================================================
// Transfer Event ABI (ERC-20)
// =============================================================================

const TRANSFER_EVENT_ABI = {
  anonymous: false,
  inputs: [
    { indexed: true, name: 'from', type: 'address' },
    { indexed: true, name: 'to', type: 'address' },
    { indexed: false, name: 'value', type: 'uint256' },
  ],
  name: 'Transfer',
  type: 'event',
} as const;

/** keccak256("Transfer(address,address,uint256)") */
const TRANSFER_EVENT_SIGNATURE =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

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

/**
 * Wraps a promise with a timeout. If the promise does not settle within
 * the specified milliseconds, it rejects with a timeout error.
 */
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
 * Verifies that an on-chain transaction represents a valid cUSD repayment
 * to the platform wallet with sufficient amount.
 *
 * Flow:
 * 1. Fetch transaction & receipt via publicClient
 * 2. Verify tx.to === cUSD contract address (TX_DESTINO_INVALIDO)
 * 3. Verify receipt.status === 'success' (TX_REVERTIDA)
 * 4. Find cUSD Transfer event in receipt logs
 * 5. Verify Transfer event recipient === platform wallet (TX_BENEFICIARIO_INVALIDO)
 * 6. Verify Transfer event value >= expected amount (TX_MONTO_INSUFICIENTE)
 *
 * @param txHash - Transaction hash to verify (0x-prefixed)
 * @param montoEsperado - Expected minimum amount in wei (bigint)
 * @returns VerificationResult — `{ valid: true }` or `{ valid: false, reason }`
 *
 * Error codes:
 * - TX_NO_ENCONTRADA: Transaction not found on-chain
 * - TX_REVERTIDA: Transaction receipt status is 'reverted'
 * - TX_DESTINO_INVALIDO: Transaction is not to the cUSD contract
 * - TX_BENEFICIARIO_INVALIDO: Transfer recipient is not the platform wallet
 * - TX_MONTO_INSUFICIENTE: Transferred amount is less than expected
 * - RPC_ERROR: RPC timeout or network error during verification
 */
export async function verificarPago(
  txHash: `0x${string}`,
  montoEsperado: bigint,
): Promise<VerificationResult> {
  const publicClient = getPublicClient();
  const cusdAddress = getCusdContractAddress();
  const platformWallet = getPlatformWalletAddress();

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
  // 2. Verify tx.to === cUSD contract address
  // ------------------------------------------------------------------
  if (!tx.to || tx.to.toLowerCase() !== cusdAddress.toLowerCase()) {
    return failure('TX_DESTINO_INVALIDO');
  }

  // ------------------------------------------------------------------
  // 3. Verify receipt status === 'success'
  // ------------------------------------------------------------------
  if (receipt.status !== 'success') {
    return failure('TX_REVERTIDA');
  }

  // ------------------------------------------------------------------
  // 4. Find the cUSD Transfer event in receipt logs
  // ------------------------------------------------------------------
  const transferLog = receipt.logs.find((log: { address: string; topics?: string[] | null }) => {
    if (log.address.toLowerCase() !== cusdAddress.toLowerCase()) return false;
    if (!log.topics?.[0]) return false;
    return log.topics[0].toLowerCase() === TRANSFER_EVENT_SIGNATURE;
  });

  if (!transferLog) {
    return failure('TX_DESTINO_INVALIDO');
  }

  // ------------------------------------------------------------------
  // 5-6. Decode Transfer event → verify recipient & amount
  // ------------------------------------------------------------------
  let decoded: { args: { from: `0x${string}`; to: `0x${string}`; value: bigint } };

  try {
    const result = decodeEventLog({
      abi: [TRANSFER_EVENT_ABI],
      data: transferLog.data,
      topics: transferLog.topics as [`0x${string}`, ...`0x${string}`[]],
    });
    decoded = result as typeof decoded;
  } catch {
    return failure('TX_DESTINO_INVALIDO');
  }

  const { to, value } = decoded.args;

  // Verify recipient === platform wallet
  if (to.toLowerCase() !== platformWallet.toLowerCase()) {
    return failure('TX_BENEFICIARIO_INVALIDO');
  }

  // Verify amount >= expected
  if (value < montoEsperado) {
    return failure('TX_MONTO_INSUFICIENTE');
  }

  return success();
}

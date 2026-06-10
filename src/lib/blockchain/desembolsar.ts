// =============================================================================
// desembolsarCredito — Core Blockchain Disbursement Operation
// =============================================================================
//
// Orchestrates the full on-chain COPm transfer:
//   1. Simulate (pre-flight check)
//   2. Execute (write contract)
//   3. Wait for receipt
//   4. Verify receipt status
//   5. Return TxHash
// =============================================================================

import { getContract } from 'viem';
import { getPublicClient, getWalletClient } from '@/lib/blockchain/client';
import { getCopmContractAddress } from '@/config/celo';
import type { Address, TxHash, Wei } from '@/types/database';

// =============================================================================
// Custom Error
// =============================================================================

export class BlockchainError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'BlockchainError';
    this.code = code;
  }
}

// =============================================================================
// Minimal ERC-20 ABI (only what we need)
// =============================================================================

const ERC20_ABI = [
  {
    type: 'function' as const,
    name: 'transfer',
    inputs: [
      { name: 'to', type: 'address', internalType: 'address' },
      { name: 'value', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool', internalType: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function' as const,
    name: 'decimals',
    inputs: [],
    outputs: [{ name: '', type: 'uint8', internalType: 'uint8' }],
    stateMutability: 'view',
  },
] as const;

// =============================================================================
// Disbursement Function
// =============================================================================

/**
 * Executes a COPm transfer to the specified address.
 *
 * Flow:
 * 1. Simulate the transfer via `simulateContract` (catches revert reasons early)
 * 2. Execute via `writeContract`
 * 3. Wait for transaction receipt
 * 4. Verify receipt status
 *
 * @param to - Recipient's Celo wallet address (branded)
 * @param monto - Amount in wei (branded)
 * @returns Transaction hash (branded)
 *
 * @throws {BlockchainError} With code:
 *   - `SIMULATION_FAILED` — contract simulation reverted
 *   - `TX_REVERTED` — transaction mined but reverted
 *   - `TX_TIMEOUT` — transaction receipt not received in time
 */
export async function desembolsarCredito(to: Address, monto: Wei): Promise<TxHash> {
  const publicClient = getPublicClient();
  const walletClient = getWalletClient();

  const copmAddress = getCopmContractAddress();

  // ------------------------------------------------------------------
  // 1. Simulate the transfer (pre-flight check)
  // ------------------------------------------------------------------
  // NOTE: We do NOT catch errors from simulateContract — the route handler
  // needs them to detect RPC failures and audit appropriately.
  const { request } = await publicClient.simulateContract({
    address: copmAddress,
    abi: ERC20_ABI,
    functionName: 'transfer',
    args: [to as `0x${string}`, monto as bigint],
    account: walletClient.account!,
  });

  // ------------------------------------------------------------------
  // 2. Execute the transfer
  // ------------------------------------------------------------------
  const txHash = await walletClient.writeContract(request);

  // ------------------------------------------------------------------
  // 3. Wait for transaction receipt
  // ------------------------------------------------------------------
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
    timeout: 60_000, // 60 seconds
  });

  // ------------------------------------------------------------------
  // 4. Verify receipt status
  // ------------------------------------------------------------------
  if (receipt.status === 'reverted') {
    throw new BlockchainError(
      'TX_REVERTED',
      `La transacción ${txHash} fue revertida en la blockchain`,
    );
  }

  return txHash as TxHash;
}
